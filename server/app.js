const express = require('express');
const fs = require('fs');
const path = require('path');
const hbs = require('hbs');
const MySQL = require('./utilsMySQL');

const app = express();
const port = 3000;

// Detectar si estem al Proxmox (si és pm2)
const isProxmox =
  !!process.env.PM2_HOME ||
  process.env.exec_mode === "cluster_mode" ||
  process.env.exec_mode === "fork_mode";

// Iniciar connexió MySQL
const db = new MySQL();
if (!isProxmox) {
  // Configurar aquí les credencials 
  // MySQL per a ordinador local
  db.init({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASS ?? '1234.',
    database: process.env.MYSQL_DB ?? 'sakila',
  });
} else {
  // Configurar aquí les credencials 
  // MySQL per a ordinador remot Proxmox
  db.init({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'super',
    password: process.env.MYSQL_PASS ?? '1234.',
    database: process.env.MYSQL_DB ?? 'sakila',
  });
}

// Static files (optional)
app.use(express.static(path.join(__dirname, '../public')));

// Disable cache
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Continguts estàtics (carpeta public)
app.use(express.static('public'))

// Handlebars
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Registrar "Helpers .hbs" aquí
hbs.registerHelper('eq', (a, b) => a == b);

// Partials de Handlebars
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

// Route
app.get('/', async (req, res) => {
  try {
    const moviesRows = await db.query('SELECT title, release_year, film_id FROM film LIMIT 5');
    const categoriesRows = await db.query('SELECT name FROM category LIMIT 5');

    const moviesJson = db.table_to_json(moviesRows, { title: 'string', release_year: 'number' });
    const categoriesJson = db.table_to_json(categoriesRows, { name: 'string' });

    const commonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8')
    );


    res.render('index', {
      movies: moviesJson,
      categories: categoriesJson,
      common: commonData
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error consultant la base de dades (Index)');
  }
});

app.get('/movies', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT f.title,f.release_year,
      GROUP_CONCAT(a.first_name, ' ', a.last_name SEPARATOR ', ') AS actors
      FROM film f
      JOIN film_actor fa ON f.film_id = fa.film_id
      JOIN actor a ON fa.actor_id = a.actor_id
      GROUP BY f.film_id 
      LIMIT 15
    `);

    const moviesJson = db.table_to_json(rows, { title: 'string', release_year: 'number', actors: 'string' });
    const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));

    res.render('movies', { movies: moviesJson, common: commonData });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en movies');
  }
});
app.get('/customers', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT c.first_name, c.last_name, 
      (SELECT GROUP_CONCAT(f.title SEPARATOR ', ') 
       FROM rental r 
       JOIN inventory i ON r.inventory_id = i.inventory_id
       JOIN film f ON i.film_id = f.film_id
       WHERE r.customer_id = c.customer_id 
       LIMIT 5) AS rentals
      FROM customer c LIMIT 25
    `);

    const customersJson = db.table_to_json(rows, { first_name: 'string', last_name: 'string', rentals: 'string' });
    const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));

    res.render('customers', { customers: customersJson, common: commonData });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en customers');
  }
});  


// Start server
const httpServer = app.listen(port, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `Servidor Sakila funcionant a:`);
  console.log(`http://localhost:${port}/`);
  console.log(`http://localhost:${port}/movies`);
  console.log(`http://localhost:${port}/customers`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  httpServer.close();
  process.exit(0);
});