const mongoose = require('mongoose');

const DEFAULT_LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/hematin';

/**
 * Menghubungkan aplikasi ExpressJS ke database MongoDB lokal menggunakan Mongoose.
 * @param {string} [uriOverride] - Opsional URI database (berguna untuk automated testing).
 */
async function connectDB(uriOverride) {
  const uri = uriOverride || process.env.MONGODB_URI || DEFAULT_LOCAL_MONGO_URI;

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[MongoDB] Terhubung ke host: ${conn.connection.host} | Database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error('[MongoDB] Gagal terhubung ke MongoDB lokal:', error.message);
    console.error(
      '[MongoDB] Tips: Pastikan MongoDB Community Server sudah terinstall dan Windows Service "MongoDB" aktif di port 27017 (cek di PowerShell: Get-Service MongoDB | Start-Service MongoDB).'
    );
    throw error;
  }
}

/**
 * Menutup koneksi database MongoDB dengan aman.
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  DEFAULT_LOCAL_MONGO_URI,
};
