import morgan from 'morgan';

// Custom morgan format omitting headers, body, or any potential PII (Security Doc §7)
export const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms'
);
