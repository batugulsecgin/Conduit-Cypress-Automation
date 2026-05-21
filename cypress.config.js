const { defineConfig } = require("cypress");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://conduit.bondaracademy.com',

    setupNodeEvents(on, config) {
      on('task', {

        // 1. OKUMA GÖREVİ
        queryDb: (query) => {
          return new Promise((resolve, reject) => {
            const dbPath = path.resolve(__dirname, 'conduit_test_data.db');
            const db = new sqlite3.Database(dbPath);

            db.all(query, [], (err, rows) => {
              db.close();
              if (err) reject(err);
              else resolve(rows);
            });
          });
        },

        // 2. YAZMA GÖREVİ (SQLITE_BUSY Hatası Giderildi)
        insertLog: ({ testName, status }) => {
          return new Promise((resolve, reject) => {
            const dbPath = path.resolve(__dirname, 'conduit_test_data.db');
            const db = new sqlite3.Database(dbPath);

            // prepare ve finalize karmaşası yerine doğrudan db.run() kullanıyoruz
            db.run('INSERT INTO test_logs (test_name, status) VALUES (?, ?)', [testName, status], (err) => {
              db.close(); // Artık güvenle kapatabiliriz
              if (err) reject(err);
              else resolve(null);
            });
          });
        }

      });

      return config;
    },
  },
});