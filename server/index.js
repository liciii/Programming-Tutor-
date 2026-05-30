import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { seedDefaultTemplates } from './services/templateService.js';

const PORT = process.env.PORT || 3001;

seedDefaultTemplates()
  .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
  });
