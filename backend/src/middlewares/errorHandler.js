/**
 * Middleware 404 ketika route tidak ditemukan.
 */
function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
  });
}

/**
 * Middleware penanganan error global ExpressJS.
 */
function globalErrorHandler(err, _req, res, _next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Format JSON pada request body tidak valid',
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Format parameter ID atau tipe data tidak valid',
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal pada server',
  });
}

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};

