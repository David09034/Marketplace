const express = require('express');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2/promise');  // Importa mysql2 para promesas
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 3000;
const mod_var = 'M';

const poolConfig = mod_var === 'D' ? {
    host: 'localhost',
    user: 'root', 
    password: '1234',
    database: 'tienda',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
} : {
    host: '192.168.1.3',
    user: 'matheo',
    password: 'admin1234',
    database: 'tienda',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Crear el pool con la configuración correspondiente
const pool = mysql.createPool(poolConfig);

app.use(session({
    secret: 'mi_secreto',   
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  
}));

// Configuración de multer para el almacenamiento de imágenes en la memoria (no en disco)
const storage = multer.memoryStorage();  // Usamos memoria en lugar de disco
const upload = multer({ storage: storage });

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
        const [rows] = await pool.query('SELECT * FROM productos');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// Ruta para obtener un producto por ID
app.get('/producto/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        const [rows] = await pool.query('SELECT * FROM productos WHERE ProductoID = ?', [productId]);

        if (rows.length > 0) {
            const product = rows[0];
            res.json(product);
        } else {
            res.status(404).json({ error: 'Producto no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar los detalles del producto' });
    }
});

// Ruta para agregar productos al carrito
app.post('/api/carrito', express.json(), (req, res) => {
    const { producto_id, nombre, precio, imagen, cantidad } = req.body;

    if (!req.session.carrito) {
        req.session.carrito = [];
    }

    let productoExistente = req.session.carrito.find(item => item.producto_id === producto_id);

    if (productoExistente) {
        productoExistente.cantidad += cantidad;
    } else {
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

// Registro de Usuarios
app.post('/api/registro', express.json(), async (req, res) => {
    const { nombre, email, contraseña, telefono, rol } = req.body;

    try {
        // Validar el formato del correo electrónico
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
        }

        // Hashear la contraseña
        const hashedPassword = await bcrypt.hash(contraseña, 10);

        // Llamar al procedimiento almacenado
        const query = `CALL REGISTRAR_USUARIO(?, ?, ?, ?, ?, @status)`;
        const values = [nombre, email, hashedPassword, telefono, rol];

        await pool.query(query, values);

        // Obtener el estado del procedimiento almacenado
        const [rows] = await pool.query('SELECT @status AS status');

        if (rows[0].status === 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
        }

        res.redirect('/Home.html');
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar el usuario' });
    }
});


// Comprobación de credenciales e inicio de sesión


app.post('/api/login', express.urlencoded({ extended: true }), async (req, res) => {
    const { email, contraseña } = req.body;

    try {
        // Llamar al procedimiento almacenado VALIDAR_USUARIO
        const query = `CALL tienda.VALIDAR_USUARIO(?, ?, @S_Usuario_ID, @S_Rol_Usuario, @S_Contraseña_Hasheada)`;
        const values = [email, contraseña];

        // Ejecutar la consulta para llamar al procedimiento
        await pool.query(query, values);

        // Obtener los valores de los parámetros de salida
        const [rows] = await pool.query('SELECT @S_Usuario_ID AS UsuarioID, @S_Rol_Usuario AS Rol_Usuario, @S_Contraseña_Hasheada AS Contraseña_Hasheada');

        if (rows.length > 0 && rows[0].UsuarioID) {
            // Obtener la información del usuario
            const userId = rows[0].UsuarioID;
            const userRole = rows[0].Rol_Usuario;
            const hashedPassword = rows[0].Contraseña_Hasheada;

            // Comparar la contraseña ingresada con la contraseña hasheada en la base de datos
            const match = await bcrypt.compare(contraseña, hashedPassword);

            if (match) {
                // Si las contraseñas coinciden, iniciar sesión
                req.session.userId = userId;
                req.session.userRole = userRole;
                res.redirect('/Home.html');
            } else {
                // Si no coinciden, devolver error
                res.status(401).json({ message: 'Contraseña incorrecta' });
            }
        } else {
            res.status(404).json({ message: 'Usuario no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});



// Obtener los productos en el carrito
app.get('/api/carrito', (req, res) => {
    if (req.session.carrito) {
        res.json(req.session.carrito);
    } else {
        res.json([]);  // Carrito vacío
    }
});

// Eliminar un producto del carrito
app.delete('/api/carrito/:id', (req, res) => {
    const productId = parseInt(req.params.id);

    if (req.session.carrito) {
        req.session.carrito = req.session.carrito.filter(item => item.producto_id !== productId);
        res.status(200).json({ message: 'Producto eliminado del carrito' });
    } else {
        res.status(404).json({ message: 'Carrito vacío' });
    }
});

// Obtener categorías
app.get('/api/categorias', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT Categoria FROM Productos WHERE Categoria IS NOT NULL');
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener categorías:', err);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

// API para insertar un producto (con imagen en memoria)
app.post('/api/productos', upload.single('Imagen'), async (req, res) => {
    const { nombre, descripcion, precio, Stock, categoria } = req.body;
    const imagen = req.file ? req.file.buffer : null; // Usamos el buffer de la imagen en la memoria

    try {
        const query = 'INSERT INTO Productos (Nombre, Descripcion, Precio, CantidadEnStock, Categoria, Imagen) VALUES (?, ?, ?, ?, ?, ?)';
        await pool.query(query, [nombre, descripcion, precio, Stock, categoria, imagen]);
        res.status(201).json({ message: 'Producto insertado exitosamente' });
    } catch (err) {
        console.error('Error al insertar el producto:', err);
        res.status(500).json({ error: 'Error al insertar el producto' });
    }
});

// Obtener la imagen de un producto
app.get('/api/producto/imagen/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        const [rows] = await pool.query('SELECT Imagen FROM Productos WHERE ProductoID = ?', [productId]);

        if (rows.length > 0) {
            const imagenData = rows[0].Imagen;

            if (!imagenData) {
                return res.status(404).json({ error: 'Imagen no encontrada' });
            }

            res.set('Content-Type', 'image/jpg');  // O 'image/png' si la imagen es PNG
            res.send(imagenData);
        } else {
            res.status(404).json({ error: 'Producto no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la imagen' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
