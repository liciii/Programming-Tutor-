import dotenv from 'dotenv';
dotenv.config();

// Prevent socket-level errors (ECONNRESET, ECONNREFUSED, TLS failures) from
// crashing the server when they escape internal error handlers as either a
// synchronous uncaught exception or an unhandled promise rejection.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server kept alive):', reason?.message ?? reason);
});

import app from './app.js';
import { seedDefaultTemplates } from './services/templateService.js';

const PORT = process.env.PORT || 3001;

seedDefaultTemplates()
  .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
  });
