import * as net from 'net';
import { PGlite } from '@electric-sql/pglite';
import { fromNodeSocket } from 'pg-gateway/node';

async function startServer() {
  const db = new PGlite();
  await db.waitReady;

  const server = net.createServer(async (socket) => {
    await fromNodeSocket(socket, {
      serverVersion: '16.4 (PostgreSQL Engine)',
      async handleQuery(query) {
        try {
          const res = await db.query(query);
          return {
            rows: res.rows,
            fields: res.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID || 25 })) || [],
          };
        } catch (err: any) {
          throw err;
        }
      },
      async handleAuth(_user, _password) {
        return true;
      },
    });
  });

  server.listen(5432, '127.0.0.1', () => {
    console.log('PostgreSQL Server listening on postgresql://postgres:postgres@127.0.0.1:5432/o2_db');
  });
}

startServer().catch(console.error);
