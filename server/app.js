const express = require('express');
const fs = require('fs');
const path = require('path');
const hbs = require('hbs');
const MySQL = require('./utilsMySQL');

const app = express();
const port = 3000;

/* MIDDLEWARE */
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());

// Detectar si estem al Proxmox (si és pm2)
const isProxmox =
  !!process.env.PM2_HOME ||
  process.env.exec_mode === "cluster_mode" ||
  process.env.exec_mode === "fork_mode";

// Iniciar connexió MySQL
const db = new MySQL();
if (!isProxmox) {
  db.init({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASS ?? '1234.',
    database: process.env.MYSQL_DB ?? 'sakila',
  });
} else {
  db.init({
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'super',
    password: process.env.MYSQL_PASS ?? '1234.',
    database: process.env.MYSQL_DB ?? 'sakila',
  });
}

// Static files
app.use(express.static(path.join(__dirname, '../public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));
// Disable cache
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Handlebars setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
hbs.registerHelper('eq', (a, b) => a == b);
hbs.registerPartials(path.join(__dirname, 'views', 'partials'));

// --- RUTES GET ---

app.get('/', async (req, res) => {
  try {
    const moviesRows = await db.query('SELECT title, release_year, film_id FROM film LIMIT 5');
    const categoriesRows = await db.query('SELECT name FROM category LIMIT 5');
    const moviesJson = db.table_to_json(moviesRows, { title: 'string', release_year: 'number' });
    const categoriesJson = db.table_to_json(categoriesRows, { name: 'string' });
    const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));

    res.render('index', { movies: moviesJson, categories: categoriesJson, common: commonData });
  } catch (err) {
    res.status(500).send('Error consultant la base de dades (Index)');
  }
});

app.get('/movies', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT f.film_id, f.title, f.release_year, 
      GROUP_CONCAT(a.first_name, ' ', a.last_name SEPARATOR ', ') AS actors
      FROM film f
      LEFT JOIN film_actor fa ON f.film_id = fa.film_id
      LEFT JOIN actor a ON fa.actor_id = a.actor_id
      GROUP BY f.film_id 
      LIMIT 15
    `);
    const moviesJson = db.table_to_json(rows, { title: 'string', release_year: 'number', actors: 'string' });
    const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));
    res.render('movies', { movies: moviesJson, common: commonData });
  } catch (err) {
    res.status(500).send('Error en movies');
  }
});

app.get('/movie', async (req, res) => {
    try {
        const id = req.query.id;
        // Cambiado: Inyección directa para evitar error de sintaxis del '?'
        const rows = await db.query(`SELECT * FROM film WHERE film_id = ${id}`);
        const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));
        res.render('movie', { movie: rows[0], common: commonData });
    } catch (err) {
        res.status(500).send("Error al carregar la pel·lícula");
    }
});

app.get('/movieEdit', async (req, res) => {
    try {
        const id = req.query.id;
        // Cambiado: Inyección directa
        const rows = await db.query(`SELECT * FROM film WHERE film_id = ${id}`);
        const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));
        res.render('movieEdit', { movie: rows[0], common: commonData });
    } catch (err) {
        res.status(500).send("Error al carregar l'edició");
    }
});

app.get('/movieAdd', (req, res) => {
    const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));
    res.render('movieAdd', { common: commonData });
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
       ORDER BY r.rental_date DESC LIMIT 3) AS rentals
      FROM customer c 
      LIMIT 25
    `);
    const customersJson = db.table_to_json(rows, { first_name: 'string', last_name: 'string', rentals: 'string' });
    const commonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'common.json'), 'utf8'));
    res.render('customers', { customers: customersJson, common: commonData });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en customers');
  }
});

// --- RUTES POST ---

app.post('/afegirPeli', async (req, res) => {
    try {
        const { title, description, release_year, language_id } = req.body;
        // Cambiado: Inyección directa de valores
        const sql = `INSERT INTO film (title, description, release_year, language_id) 
                     VALUES ('${title}', '${description}', ${release_year}, ${language_id})`;
        await db.query(sql);
        res.redirect('/movies');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error al afegir");
    }
});

app.post('/editarPeli', async (req, res) => {
    try {
        const { film_id, title, description, release_year } = req.body;
        // Cambiado: Inyección directa de valores
        const sql = `UPDATE film SET title = '${title}', description = '${description}', release_year = ${release_year} 
                     WHERE film_id = ${film_id}`;
        await db.query(sql);
        res.redirect(`/movie?id=${film_id}`); 
    } catch (err) {
        console.error(err);
        res.status(500).send("Error al editar");
    }
});

app.post('/esborrarPeli', async (req, res) => {
    try {
        const { film_id } = req.body;
        // Cambiado: Inyección directa
        await db.query(`DELETE FROM film WHERE film_id = ${film_id}`);
        res.redirect('/movies');
    } catch (err) {
        res.status(500).send("Error: No es pot esborrar una peli amb relacions actives.");
    }
});

// Start server
const httpServer = app.listen(port, () => {
  console.log(`Servidor funcionant a http://localhost:${port}/`);
});

process.on('SIGINT', () => {
  httpServer.close();
  process.exit(0);
});