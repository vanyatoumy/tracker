// Typed application errors. Each carries an HTTP status code and is safe to
// expose to the client (the message is written by us, never raw internals).
// Anything thrown that is NOT one of these is treated as an unexpected/
// internal error by server.js: full detail goes to the server log, and only
// a generic message goes to the client in production.

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.expose = true;
    }
}

class ValidationError extends AppError {
    constructor(message) { super(message, 400); }
}

class AuthError extends AppError {
    constructor(message = 'Non authentifie') { super(message, 401); }
}

class NotFoundError extends AppError {
    constructor(message = 'Introuvable') { super(message, 404); }
}

class ConflictError extends AppError {
    constructor(message) { super(message, 409); }
}

module.exports = { AppError, ValidationError, AuthError, NotFoundError, ConflictError };
