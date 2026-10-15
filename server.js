const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');

const host = process.env.HOST || 'localhost';
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'yps_reactive_form';
const allowedOrigins = new Set((process.env.CORS_ORIGINS || 'http://localhost:4200,http://127.0.0.1:4200,https://yps-reactive-form2.vercel.app')
  .split(',').map((origin) => origin.trim()).filter(Boolean));

if (!mongoUri) throw new Error('MONGODB_URI must be set to start the student API.');

const mongoClient = new MongoClient(mongoUri);
let studentsCollection;

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

const requiredText = (value, label, min, max) => {
  if (typeof value !== 'string') return `${label} is required.`;
  const text = value.trim();
  if (text.length < min) return `${label} must be at least ${min} characters.`;
  if (text.length > max) return `${label} must be no more than ${max} characters.`;
  return null;
};

function validateStudent(student) {
  if (!student || typeof student !== 'object' || Array.isArray(student)) return 'A student object is required.';
  const checks = [
    requiredText(student.firstName, 'First name', 2, 50),
    requiredText(student.lastName, 'Last name', 2, 50),
    requiredText(student.phone, 'Phone', 10, 10),
    requiredText(student.gender, 'Gender', 1, 20),
    requiredText(student.admissionYear, 'Admission year', 7, 7),
    requiredText(student.className, 'Class', 1, 2)
  ];
  if (typeof student.email !== 'string' || student.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email.trim())) {
    return 'Enter a valid email address.';
  }
  const invalid = checks.find(Boolean);
  if (invalid) return invalid;
  if (!/^[6-9]\d{9}$/.test(student.phone)) return 'Enter a valid 10-digit Indian mobile number.';
  if (!['Female', 'Male', 'Other'].includes(student.gender)) return 'Select a valid gender.';
  if (!/^\d{4}-\d{2}$/.test(student.admissionYear)) return 'Use the academic session format YYYY-YY.';
  if (!['8', '9', '10'].includes(student.className)) return 'Select a valid class.';
  const subjects = ['English', 'Maths', 'Science', 'Social Science'];
  const subjectCatalog = { '8': subjects, '9': subjects, '10': subjects };
  if (!Array.isArray(student.subjects) || student.subjects.length === 0 || student.subjects.some((subject) => !subjectCatalog[student.className].includes(subject))) {
    return 'Select at least one valid subject for the class.';
  }
  if (typeof student.selfStudy !== 'boolean') return 'Self study mode must be true or false.';
  for (const field of ['courseFee', 'discount', 'initialPayment']) {
    if (!Number.isFinite(student[field]) || student[field] < 0) return `${field} must be a non-negative amount.`;
  }
  if (student.discount > student.courseFee) return 'Discount cannot be greater than total course fees.';
  if (student.initialPayment > student.courseFee - student.discount) return 'Initial payment cannot be greater than the discounted total fees.';
  if (typeof student.remarks !== 'string' || student.remarks.length > 500) return 'Remarks must be no more than 500 characters.';
  if (student.photo !== undefined && student.photo !== '') {
    if (typeof student.photo !== 'string' || student.photo.length > 2800000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(student.photo)) {
      return 'Photo must be a JPG, PNG, or WEBP image no larger than 2 MB.';
    }
  }
  if (student.initialPayment > 0) {
    if (!['Cash', 'Online'].includes(student.paymentMethod)) return 'Choose Cash or Online for the initial payment.';
    if (student.paymentMethod === 'Online' && !['Google Pay', 'PhonePe', 'Paytm', 'UPI (other)', 'Card', 'Net banking'].includes(student.onlineProvider)) {
      return 'Select an online payment method.';
    }
  }
  return null;
}

async function readStudents() {
  return studentsCollection.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
}

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    return response.end();
  }

  const route = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
  try {
    if (request.method === 'GET' && route === '/api/health') return send(response, 200, { status: 'ok' });
    if (request.method === 'GET' && route === '/api/students') return send(response, 200, await readStudents());
    if (request.method === 'POST' && route === '/api/students') {
      const body = await readBody(request);
      const validationError = validateStudent(body);
      if (validationError) return send(response, 400, { message: validationError });
      const phone = body.phone.trim();
      if (await studentsCollection.findOne({ phone }, { projection: { _id: 1 } })) {
        return send(response, 409, { message: 'A student with this phone number already exists.' });
      }
      const totalFees = Number(body.courseFee);
      const discount = Number(body.discount);
      const paidAmount = Number(body.initialPayment);
      const student = {
        id: randomUUID(),
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email.trim().toLowerCase(),
        phone,
        gender: body.gender,
        photo: body.photo || undefined,
        admissionYear: body.admissionYear,
        className: body.className,
        subjects: body.subjects,
        selfStudy: body.selfStudy,
        courseFee: totalFees,
        discount,
        totalFees,
        paidAmount,
        pendingFees: Math.max(0, totalFees - discount - paidAmount),
        initialPayment: paidAmount,
        paymentDate: paidAmount ? todayInIndia() : undefined,
        paymentMethod: paidAmount ? body.paymentMethod : undefined,
        onlineProvider: paidAmount && body.paymentMethod === 'Online' ? body.onlineProvider : undefined,
        remarks: body.remarks.trim(),
        createdAt: new Date().toISOString()
      };
      await studentsCollection.insertOne(student);
      return send(response, 201, student);
    }
    return send(response, 404, { message: 'Route not found.' });
  } catch (error) {
    if (error.code === 11000) return send(response, 409, { message: 'A student with this phone number already exists.' });
    return send(response, error.status || 500, { message: error.status ? error.message : 'The student service encountered an error.' });
  }
});

async function start() {
  await mongoClient.connect();
  const database = mongoClient.db(databaseName);
  studentsCollection = database.collection('students');
  await studentsCollection.createIndex({ phone: 1 }, { unique: true });
  server.listen(port, host, () => console.log(`YPS student API listening at http://${host}:${port}`));
}

start().catch((error) => {
  console.error('Could not connect to MongoDB or initialize the students collection:', error.message);
  process.exitCode = 1;
  mongoClient.close().finally(() => process.exit());
});
