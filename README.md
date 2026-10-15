# YPS Reactive Form Backend

Standalone Node.js API for the YPS student admission frontend.

## Run

Run `npm start` in this folder. The API listens at `http://localhost:3000`.

Student records are stored in MongoDB Atlas, in the `students` collection of the `yps_reactive_form` database by default. Set `MONGODB_URI` in the backend environment to your Atlas connection string before starting the API. You can override the database name with `MONGODB_DB`.

For local development, set the variable in your shell before running `npm start` (PowerShell: `$env:MONGODB_URI = 'your-connection-string'`; macOS/Linux: `export MONGODB_URI='your-connection-string'`). Keep the connection string out of source control and frontend configuration. In Atlas, allow network access from the backend host's IP or network; the API will not start until it can connect to MongoDB. On startup it creates a unique index on student phone numbers.

By default, the API accepts requests from the local frontend at `http://localhost:4200` and the deployed frontend at `https://yps-reactive-form2.vercel.app`.

Configure `PORT`, `HOST`, or comma-separated `CORS_ORIGINS` as needed. If `CORS_ORIGINS` is set in the backend hosting environment, include both the deployed URL and any local development URLs, for example:

```text
CORS_ORIGINS=https://yps-reactive-form2.vercel.app,http://localhost:4200,http://127.0.0.1:4200
```

The frontend must also use the backend's deployed base URL for its API requests; CORS only permits the browser request and does not configure the frontend's API URL.

When an initial payment is submitted, the API records the payment date as the current date in India (`Asia/Kolkata`), regardless of any date sent by the frontend.
