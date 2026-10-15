# YPS Reactive Form Backend

Standalone Node.js API for the YPS student admission frontend.

## Run

Run `npm start` in this folder. The API listens at `http://localhost:3000`.

Student records are saved to `data/students.json`. By default, the API accepts requests from the local frontend at `http://localhost:4200` and the deployed frontend at `https://yps-reactive-form2.vercel.app`.

Configure `PORT`, `HOST`, or comma-separated `CORS_ORIGINS` as needed. If `CORS_ORIGINS` is set in the backend hosting environment, include both the deployed URL and any local development URLs, for example:

```text
CORS_ORIGINS=https://yps-reactive-form2.vercel.app,http://localhost:4200,http://127.0.0.1:4200
```

The frontend must also use the backend's deployed base URL for its API requests; CORS only permits the browser request and does not configure the frontend's API URL.

When an initial payment is submitted, the API records the payment date as the current date in India (`Asia/Kolkata`), regardless of any date sent by the frontend.
