const express = require('express');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2/promise');  // Importa mysql2 para promesas
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 3001;
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
    host: '192.168.1.16',
    user: 'admin1',
    password: 'admin1',
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
        const [rows] = await pool.query('SELECT * FROM Productos');
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
        const [rows] = await pool.query('SELECT * FROM Productos WHERE ProductoID = ?', [productId]);

        if (rows.length > 0) {
            const product = rows[0];

            // Enviar los detalles del producto, pero la URL de la imagen se enviará por separado
            res.json({
                nombre: product.Nombre,
                descripcion: product.Descripcion,
                precio: product.Precio,
                imagenUrl: `/api/producto/imagen/${productId}`,  // Usar la URL de la imagen
            });
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
    const { nombre, email, contraseña, telefono, rol, empresa, ubicacion } = req.body;

    try {
        // Imprimir los valores recibidos
        console.log("Datos recibidos:");
        console.log("Nombre:", nombre);
        console.log("Email:", email);
        console.log("Contraseña:", contraseña);
        console.log("Teléfono:", telefono);
        console.log("Rol:", rol);
        console.log("Empresa:", empresa);
        console.log("Ubicación:", ubicacion);

        // Validar el formato del correo electrónico
        const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
        }

        // Hashear la contraseña
        const hashedPassword = await bcrypt.hash(contraseña, 10);

        // Imprimir la contraseña hasheada
        console.log("Contraseña hasheada:", hashedPassword);

        // Llamar al procedimiento almacenado
        let query;
        let values;

        if (rol === 'Productor') {
            // Incluir los valores para el rol "Productor"
            query = 'CALL REGISTRAR_USUARIO(?, ?, ?, ?, ?, ?, ?, @status)';
            values = [nombre, email, hashedPassword, telefono, rol, empresa, ubicacion];
        } else {
            // Para el rol "Consumidor", no se necesitan los nuevos campos
            query = 'CALL REGISTRAR_USUARIO(?, ?, ?, ?, ?, NULL, NULL, @status)';
            values = [nombre, email, hashedPassword, telefono, rol, null, null];
        }

        // Imprimir la consulta y los valores que se están pasando
        console.log("Consulta:", query);
        console.log("Valores:", values);

        // Ejecutar la consulta
        await pool.query(query, values);

        // Obtener el estado del procedimiento almacenado
        const [rows] = await pool.query('SELECT @status AS status');

        // Imprimir el estado recibido del procedimiento almacenado
        console.log("Estado del procedimiento almacenado:", rows[0].status);

        if (rows[0].status === 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
        }

        res.redirect('/Index.html');
    } catch (error) {
        console.error("Error al registrar el usuario:", error);
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
                // Si las contraseñas coinciden, responder con los datos del usuario
                res.json({
                    userId: userId,
                    userRole: userRole,
                    message: 'Inicio de sesión exitoso'
                });
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
    const imagen = req.file ? req.file.buffer : null;  // Usamos el buffer de la imagen en la memoria

    // Verificación de los datos recibidos
    console.log('Datos recibidos:', { nombre, descripcion, precio, Stock, categoria });

    // Suponiendo que el ID del productor (userId) lo tienes disponible en la sesión o en el cuerpo de la solicitud
    const productorID = req.body.productorID; // Asegúrate de que este valor esté siendo enviado por el cliente

    if (!productorID) {
        return res.status(400).json({ error: 'ID de productor no proporcionado' });
    }

    try {
        // Llamar al procedimiento almacenado para insertar el producto
        const query = 'CALL InsertarProducto(?, ?, ?, ?, ?, ?, ?)';
        await pool.query(query, [productorID, nombre, descripcion, precio, Stock, categoria, imagen]);

        res.status(201).json({ message: 'Producto insertado exitosamente' });
    } catch (err) {
        console.error('Error al insertar el producto:', err);
        res.status(500).json({ error: 'Error al insertar el producto' });
    }
});


// Asegúrate de usar el middleware para leer JSON en el cuerpo de la solicitud
app.use(express.json());
//API Producto por vendedor
app.post('/api/productos/vendedor', (req, res) => {
    const userId = req.body['userId'];  // Obtener el parámetro user-id desde el cuerpo de la solicitud

    console.log('UserID API: ' + userId);

    if (!userId || isNaN(userId)) {
        return res.status(400).json({ message: 'ID de usuario inválido' });
    }

    // Llamar al procedimiento almacenado para obtener los productos del vendedor usando el userId
    pool.query('CALL Get_Productos_Vendedor(?)', [userId], (err, results) => {
        if (err) {
            console.error('Error al ejecutar procedimiento almacenado', err);
            return res.status(500).json({ message: 'Error interno del servidor' });
        }
        console.log(results);
        const productos = results[0];  // El resultado se encuentra en la primera posición del array

        if (!productos || productos.length === 0) {
            return res.status(404).json({ message: 'No se encontraron productos para este vendedor' });
        }

        res.json(productos);  // Enviar los productos al cliente
    });
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


