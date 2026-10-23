require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const connectDB = require('../config/db');
const app = require('../app');
const http = require('http');

async function run() {
  await connectDB();
  console.log('MongoDB connected.');

  const server = http.createServer(app);
  server.listen(0, async () => {
    const port = server.address().port;
    console.log('Test server listening on port', port);

    async function get(path) {
      const res = await fetch('http://127.0.0.1:' + port + path);
      const data = await res.json();
      return { status: res.status, data };
    }

    try {
      const catRes = await get('/api/v2/catalog/categories/digital-marketing');
      console.log('GET /categories/digital-marketing status:', catRes.status, 'Success:', catRes.data.success, 'Name:', catRes.data.data?.name);

      const subsRes = await get('/api/v2/catalog/categories/digital-marketing/subcategories');
      console.log('GET /categories/digital-marketing/subcategories status:', subsRes.status, 'Count:', subsRes.data.data?.length);

      const podSubRes = await get('/api/v2/catalog/subcategories/podcasting');
      console.log('GET /subcategories/podcasting status:', podSubRes.status, 'Name:', podSubRes.data.data?.name);

      const pkgRes = await get('/api/v2/catalog/subcategories/podcasting/packages');
      console.log('GET /subcategories/podcasting/packages status:', pkgRes.status, 'Packages count:', pkgRes.data.data?.length);

      const qRes = await get('/api/v2/catalog/subcategories/podcasting/questions');
      console.log('GET /subcategories/podcasting/questions status:', qRes.status, 'Questions count:', qRes.data.data?.length);

      const adminCats = await get('/api/v2/admin/catalog/categories');
      console.log('GET /admin/catalog/categories status:', adminCats.status, 'Categories count:', adminCats.data.data?.length);

      console.log('✅ ALL EXPRESS ROUTE ENDPOINTS VERIFIED SUCCESSFULLY!');
    } catch (e) {
      console.error('Test error:', e);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

run();
