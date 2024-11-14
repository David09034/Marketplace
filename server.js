const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const session = require('express-session');
const app = express();
const PORT = 3000;
const bcrypt = require('bcrypt');

// Configura la conexión a PostgreSQL
const pool = new Pool({
    user: 'postgres',         
    host: 'localhost',
    database: 'tienda',
    password: '2013',  
});

app.use(session({
    secret: 'mi_secreto',   
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal para la página de productos
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Index.html'));
});

// Ruta para obtener productos desde la base de datos
app.get('/api/productos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM productos');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

app.get('/producto/:id', async (req, res) => {
    const productId = req.params.id; // Capturamos el ID del producto desde la URL

    try {
        // Consulta para obtener los detalles del producto desde la base de datos
        const query = 'SELECT * FROM productos WHERE id = $1';
        const result = await pool.query(query, [productId]);

        if (result.rows.length > 0) {
            const product = result.rows[0];
            
            // Enviar los detalles del producto al cliente
            res.json(product);
        } else {
            res.status(404).json({ error: 'Producto no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar los detalles del producto' });
    }
});


app.post('/api/carrito', express.json(), (req, res) => {
    const { producto_id, nombre, precio, imagen, cantidad } = req.body;

    // Si no existe carrito en la sesión, inicializarlo
    if (!req.session.carrito) {
        req.session.carrito = [];
    }

    // Verificar si el producto ya está en el carrito
    let productoExistente = req.session.carrito.find(item => item.producto_id === producto_id);

    if (productoExistente) {
        // Si el producto ya existe, actualizar la cantidad
        productoExistente.cantidad += cantidad;
    } else {
        // Si no existe, agregar el producto
        req.session.carrito.push({
            producto_id,
            nombre,
            precio,
            imagen,
            cantidad
        });
    }

    res.status(201).json({ message: 'Producto agregado al carrito' });
});

// registro de Usuarios
app.post('/api/registro', express.json(), async (req, res) => {
    const { nombre, email, contraseña, telefono, rol } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(contraseña, 10);

        const query = `
            INSERT INTO Usuarios (Nombre, Email, Contraseña, Telefono, Rol)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING UsuarioID
        `;
        
        const values = [nombre, email, hashedPassword, telefono, rol];
        const result = await pool.query(query, values);
        
        res.redirect('/Home.html');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar el usuario' });
    }
});

// Comprobación de credenciales e inicio de sesion
app.post('/api/login', express.urlencoded({ extended: true }), async (req, res) => {
    const { email, contraseña } = req.body;

    try {
        // Busca al usuario en la base de datos por su email
        const query = 'SELECT * FROM Usuarios WHERE Email = $1';
        const result = await pool.query(query, [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];

            // Verifica la contraseña usando bcrypt
            const match = await bcrypt.compare(contraseña, user.contraseña);

            if (match) {
                // Almacena información de la sesión
                req.session.userId = user.usuarioid;
                req.session.userName = user.nombre;

                // Redirige a Home.html si el login es exitoso
                res.redirect('/Home.html');
            } else {
                // Contraseña incorrecta
                res.status(401).json({ message: 'Contraseña Incorrecta' });
            }
        } else {
            // Usuario no encontrado
            res.status(404).json({ message: 'usaurio Incorrecto' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});


app.get('/api/carrito', (req, res) => {
    if (req.session.carrito) {
        res.json(req.session.carrito);
    } else {
        res.json([]);  // Carrito vacío
    }
});

app.delete('/api/carrito/:id', (req, res) => {
    const productId = parseInt(req.params.id);

    if (req.session.carrito) {
        req.session.carrito = req.session.carrito.filter(item => item.producto_id !== productId);
        res.status(200).json({ message: 'Producto eliminado del carrito' });
    } else {
        res.status(404).json({ message: 'Carrito vacío' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
