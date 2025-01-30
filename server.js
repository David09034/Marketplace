const express = require('express');
const multer = require('multer');
const path = require('path');
const mysql = require('mysql2/promise');  // Importa mysql2 para promesas
const sharp = require('sharp');
const compression = require('compression');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 3030;
const mod_var = 'P';

const poolConfig = mod_var === 'P' ? {
    host: '46.202.177.158',
    user: 'hostinger',
    password: 'Admin1@hostinger',
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


app.use(compression());

const cors = require('cors');

// Habilitar CORS para tu frontend
const corsOptions = {
    origin: 'http://tiendaschugchilan.xyz', // Permite solicitudes solo desde este dominio
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
};
app.use(cors(corsOptions));
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

//Configuracion cache
app.use('/static', (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // Cache a largo plazo para imágenes
    next();
});
app.use((req, res, next) => {
    if (!req.path.startsWith('/static')) {
        res.setHeader('Cache-Control', 'no-store'); // Sin caché para otros archivos
    }
    next();
});
// Ruta principal para la página de productos
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Index.html'));
});


const { enviarCorreo } = require('./public/mailer'); 
//Enviar correos de confirmacion
app.post('/api/enviar-correo', async (req, res) => {
    try {
        await enviarCorreo(req.body);
        res.json({ message: 'Correo enviado correctamente' });
    } catch (error) {
        console.error('Error al enviar correo:', error);
        res.status(500).json({ message: 'Error al enviar el correo' });
    }
});


// Ruta para obtener productos desde la base de datos
app.get('/api/productos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT ProductoID, Nombre, Precio  FROM Productos where stock > 0');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// Ruta para obtener las calificaciones de un producto
app.get('/api/calificaciones/:productoId', async (req, res) => {
    const productoId = req.params.productoId;

    try {
        // Obtener todas las calificaciones del producto
        const [rows] = await pool.query('SELECT c.Calificacion, c.Comentario, u.Nombre AS UsuarioNombre FROM Calificaciones c JOIN Usuarios u ON c.UsuarioID = u.UsuarioID WHERE c.ProductoID = ?', [productoId]);

        // Verificar si se encontraron calificaciones
        if (rows.length > 0) {
            res.json(rows);  // Enviar las calificaciones encontradas
        } else {
            res.status(200).json([]);  // Enviar array vacío si no hay calificaciones
        }
    } catch (error) {
        console.error('Error al obtener las calificaciones:', error);
        res.status(500).json({ error: 'Error al obtener las calificaciones' });
    }
});

app.post('/api/calificaciones', (req, res) => {
    const { ProductoID, UsuarioID, Calificacion, Comentario } = req.body;

    if (!ProductoID || !UsuarioID || !Calificacion) {
        return res.status(400).json({ message: 'ProductoID, UsuarioID y Calificacion son obligatorios.' });
    }

    // Insertar la calificación directamente en la base de datos
    const sql = 'INSERT INTO Calificaciones (ProductoID, UsuarioID, Calificacion, Comentario) VALUES (?, ?, ?, ?)';
    const values = [ProductoID, UsuarioID, Calificacion, Comentario || null];

    pool.query(sql, values, (err, result) => {
        if (err) {
            console.error('Error al guardar la calificación:', err);
            return res.status(500).json({ message: 'Error al guardar la calificación.' });
        }

        res.status(201).json({ message: 'Calificación guardada exitosamente.', CalificacionID: result.insertId });
    });
});

app.get('/api/productos/:orderId', async (req, res) => {
    const orderId = req.params.orderId;
  
    try {

      const [productorRows] = await pool.query('SELECT ProductoID FROM OrdenDetalle WHERE OrdenID = ?', [orderId]);
  
      if (productorRows.length === 0) {
        return res.status(404).json({ error: 'No se encontró producto para este pedido' }); // More specific error message
      }
  
      const productoId = productorRows[0].ProductoID;
  
   
      const [productoRows] = await pool.query('SELECT * FROM Productos WHERE ProductoID = ?', [productoId]);
  
      if (productoRows.length > 0) {
        const producto = productoRows[0]; 
        
        res.json({
          id: producto.ProductoID, 
          nombre: producto.Nombre,
          descripcion: producto.Descripcion,
          precio: producto.Precio,
          stock: producto.Stock,
          categoria: producto.Categoria,
          imageUrl: `/api/producto/imagen/${productoId}`, 
          productorId: producto.ProductorID,
        });
      } else {
        res.status(404).json({ error: 'No se encontró producto para este pedido' }); 
      }
    } catch (error) {
      console.error(error);
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

            res.json({
                nombre: product.Nombre,
                descripcion: product.Descripcion,
                precio: product.Precio,
                stock: product.Stock,  
                categoria: product.Categoria,  
                imagenUrl: `/api/producto/imagen/${productId}`,  
                productorId: product.ProductorID,
                productoId: product.ProductoID,
            });

        } else {
            res.status(404).json({ error: 'Producto no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cargar los detalles del producto' });
    }
});

// Eliminar producto (poner stock a 0)
app.delete('/delete/producto/:productoID', async (req, res) => {
    const { productoID } = req.params;  // Obtener el productoID desde los parámetros de la URL

    // Consulta SQL para poner el stock a 0 (eliminar lógicamente el producto)
    const query = 'UPDATE Productos SET stock = 0 WHERE productoID = ?';

    try {
        // Ejecutar la consulta SQL
        const [result] = await pool.query(query, [productoID]);

        // Verificar si no se afectaron filas (producto no encontrado o ya eliminado)
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado o ya eliminado' });
        }

        // Respuesta exitosa
        res.json({ message: 'Producto eliminado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar el stock:', error);
        res.status(500).json({ error: 'Hubo un problema al eliminar el producto' });
    }
});

app.get('/api/carrito', (req, res) => {
    res.json(req.session.carrito || []); 
});


app.put('/update/producto/:id', upload.single('imagen'), async (req, res) => {
    const productId = req.params.id;
    const { nombre, descripcion, precio, stock, categoria } = req.body;

    // Obtener la imagen si se ha subido y comprimirla
    let imagen = null;

    if (req.file) {
        try {
            imagen = await sharp(req.file.buffer)
                .resize(600, 600, { fit: 'inside' }) // Cambia el tamaño si es necesario
                .jpeg({ quality: 80 }) // Ajusta la calidad
                .toBuffer(); // Convertir la imagen a un buffer comprimido
        } catch (error) {
            console.error("Error al comprimir la imagen:", error);
            return res.status(500).json({ error: 'Error al comprimir la imagen' });
        }
    }

    // Comprobar campos requeridos
    if (!nombre || !descripcion || !precio || !stock || !categoria) {
        return res.status(400).json({ error: 'Todos los campos son necesarios excepto la imagen' });
    }

    try {
        // Construir consulta de forma dinámica
        let query = `
            UPDATE Productos
            SET Nombre = ?, Descripcion = ?, Precio = ?, Stock = ?, Categoria = ?
        `;
        const queryParams = [nombre, descripcion, precio, stock, categoria];

        // Agregar actualización de imagen si está presente
        if (imagen) {
            query += `, Imagen = ?`;
            queryParams.push(imagen);
        }

        query += ` WHERE ProductoID = ?`;
        queryParams.push(productId);

        // Ejecutar la consulta
        const [result] = await pool.query(query, queryParams);

        if (result.affectedRows > 0) {
            res.json({ message: 'Producto actualizado exitosamente' });
        } else {
            res.status(400).json({ error: 'No se pudo actualizar el producto' });
        }
    } catch (error) {
        console.error("Error al actualizar el producto:", error);
        res.status(500).json({ error: 'Error al actualizar el producto' });
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
            imagen: `/api/producto/imagen/${producto_id}`,
            cantidad
        });
    }
    
    res.status(201).json({ message: 'Producto agregado al carrito'  });
});



app.post('/api/registro', express.json(), async (req, res) => {
    const { nombre, email, contraseña, telefono, rol, empresa, ubicacion, direccion } = req.body;

    try {
        // Hashear la contraseña
        const hashedPassword = await bcrypt.hash(contraseña, 10);

        let query, values;

        if (rol === 'Productor') {
            query = 'CALL REGISTRAR_USUARIO(?, ?, ?, ?, ?, ?, ?, NULL, @status)';
            values = [nombre, email, hashedPassword, telefono, rol, empresa || null, ubicacion || null];
        } else if (rol === 'Consumidor') {
            query = 'CALL REGISTRAR_USUARIO(?, ?, ?, ?, ?, NULL, NULL, ?, @status)';
            values = [nombre, email, hashedPassword, telefono, rol, direccion || null];
        } else {
            return res.status(400).json({ error: 'Rol inválido' });
        }

        await pool.query(query, values);

        const [rows] = await pool.query('SELECT @status AS status');
        const status = rows[0].status;

	if (status === 0) {
            return res.redirect(`/Register.html?error=El correo electrónico ya está registrado`);
        } else if (status === 3) {
            return res.redirect(`/Register.html?error=No puedes registrarte como vendedor`);
        }

        res.redirect('/Login.html');
    } catch (error) {
        console.error("Error al registrar el usuario:", error);
        res.redirect(`/Register.html?error=Error al registrar el usuario`);
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
		console.log(`Usuario inició sesión: { email: ${email}, userId: ${userId}, rol: ${userRole} }`);

                // Si las contraseñas coinciden, responder con los datos del usuario
                res.json({
                    userId: userId,
                    userRole: userRole,
                    message: 'Inicio de sesión exitoso',
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

//Traer info para formulario compra
// Ruta para obtener la información del usuario
app.get('/api/usuarios/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        // Consulta para obtener los datos del usuario y su dirección
        const [usuarioRows] = await pool.query(
            `SELECT u.Nombre, u.Telefono, c.Direccion from Usuarios u
            join Clientes c on u.UsuarioID = c.UsuarioID
            WHERE u.UsuarioID = ?`, 
            [userId]
        );

        // Verificar si se encontró el usuario
        if (usuarioRows.length > 0) {
            res.json(usuarioRows[0]); // Enviar los datos del usuario
        } else {
            res.status(404).json({ error: 'Usuario no encontrado' });
        }
    } catch (error) {
        console.error('Error al obtener datos del usuario:', error);
        res.status(500).json({ error: 'Error al obtener los datos del usuario' });
    }
});




// Endpoint para obtener las ventas realizadas por un productor
app.get('/ventas/productor/:usuarioId', async (req, res) => {
    const usuarioId = req.params.usuarioId;

    try {
        // Verificar si el usuario es el administrador (usuarioId 44)
        if (usuarioId === '44') {
            // Obtener todas las ventas de todos los productores
         const [ordenesRows] = await pool.execute(
                 `SELECT DISTINCT 
        o.OrdenID, o.FechaOrden, o.Total, o.Estado
    FROM Ordenes o
    JOIN OrdenDetalle od ON o.OrdenID = od.OrdenID
    JOIN Productos p ON od.ProductoID = p.ProductoID
    ORDER BY o.FechaOrden DESC`
            );

            if (ordenesRows.length === 0) {
                return res.status(404).json({ message: 'No hay ventas registradas' });
            }

            // Paso 3: Obtener detalles de los productos vendidos para todas las órdenes
            const ventas = [];

            // Iterar sobre las órdenes para obtener sus productos (de todos los vendedores)
            for (const orden of ordenesRows) {
                const [productosRows] = await pool.execute(
                    `SELECT 
                        p.Nombre AS Producto, od.Cantidad, od.PrecioUnitario AS Precio, od.Subtotal, p.ProductorID
                    FROM OrdenDetalle od
                    JOIN Productos p ON od.ProductoID = p.ProductoID
                    WHERE od.OrdenID = ?`,
                    [orden.OrdenID]  // Solo se filtra por la orden, no por el productor
                );

                ventas.push({
                    OrdenID: orden.OrdenID,
                    FechaOrden: orden.FechaOrden,
                    Total: orden.Total,
                    Estado: orden.Estado,
                    Productos: productosRows,  // Todos los productos de esta orden
                });
            }

            // Devolver todas las ventas y sus productos
            return res.json(ventas);
        } else {
            // Obtener el productorId para un usuario normal
            const [productorRows] = await pool.execute(
                'SELECT ProductorID FROM Productores WHERE UsuarioID = ?',
                [usuarioId]
            );

            if (productorRows.length === 0) {
                return res.status(404).json({ message: 'Productor no encontrado' });
            }

            const productorId = productorRows[0].ProductorID;

            // Obtener las órdenes del productor
            const [ordenesRows] = await pool.execute(
                `SELECT 
                    o.OrdenID, o.FechaOrden, o.Total, o.Estado
                FROM Ordenes o
                JOIN OrdenDetalle od ON o.OrdenID = od.OrdenID
                JOIN Productos p ON od.ProductoID = p.ProductoID
                WHERE p.ProductorID = ? 
                ORDER BY o.FechaOrden DESC`,
                [productorId]
            );

            if (ordenesRows.length === 0) {
                return res.status(404).json({ message: 'No hay ventas registradas para este productor' });
            }

            // Paso 3: Obtener detalles de los productos vendidos
            const ventas = [];

            for (const orden of ordenesRows) {
                const [productosRows] = await pool.execute(
                    `SELECT 
                        p.Nombre AS Producto, od.Cantidad, od.PrecioUnitario AS Precio, od.Subtotal
                    FROM OrdenDetalle od
                    JOIN Productos p ON od.ProductoID = p.ProductoID
                    WHERE od.OrdenID = ? AND p.ProductorID = ?`,
                    [orden.OrdenID, productorId]
                );

                ventas.push({
                    OrdenID: orden.OrdenID,
                    FechaOrden: orden.FechaOrden,
                    Total: orden.Total,
                    Estado: orden.Estado,
                    Productos: productosRows,
                });
            }

            // Devolver los resultados en formato JSON
            return res.json(ventas);
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});





//Actualizar estado compra
app.post('/ventas/actualizarEstado', (req, res) => {
    const { ordenId, nuevoEstado } = req.body;
  
    // Validar si el estado es uno de los valores permitidos
    const estadosValidos = ['Pendiente', 'Pagado', 'Enviado', 'Completado', 'Cancelado'];
    if (!estadosValidos.includes(nuevoEstado)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }
  
    // Actualizar el estado en la base de datos
    pool.query(
      'UPDATE Ordenes SET Estado = ? WHERE OrdenID = ?',
      [nuevoEstado, ordenId],
      (error, results) => {
        if (error) {
          console.error('Error al actualizar el estado:', error);
          return res.status(500).json({ error: 'Error al actualizar el estado de la orden' });
        }
  
        if (results.affectedRows === 0) {
          return res.status(404).json({ error: 'Orden no encontrada' });
        }
  
        return res.json({ message: 'Estado de la orden actualizado correctamente' });
      }
    );
  });



// API para insertar un producto (con imagen en memoria)
app.post('/api/productos', upload.single('Imagen'), async (req, res) => {
    const { nombre, descripcion, precio, Stock, categoria } = req.body;
    let imagen = req.file ? req.file.buffer : null;  // Usamos el buffer de la imagen en la memoria

    // Verificación de los datos recibidos
    if (!nombre || !descripcion || !precio || !Stock || !categoria) {
        return res.status(400).json({ error: 'Faltan datos en la solicitud' });
    }

    const productorID = req.body.productorID;

    if (!productorID) {
        return res.status(400).json({ error: 'ID de productor no proporcionado' });
    }

    try {
        // Si se proporciona una imagen, procesarla (redimensionar y comprimir)
        if (imagen) {
            // Redimensionar la imagen a un máximo de 800x800 píxeles y comprimirla a formato JPEG con calidad 80
            imagen = await sharp(imagen)
                .resize(600, 600, { fit: 'inside' }) // Redimensiona respetando la relación de aspecto
                .jpeg({ quality: 80 }) // Comprime a formato JPEG con calidad del 80%
                .toBuffer(); // Convierte la imagen procesada en un buffer
        }

        // Llamar al procedimiento almacenado para insertar el producto
        const query = 'CALL InsertarProducto(?, ?, ?, ?, ?, ?, ?)';
        await pool.query(query, [productorID, nombre, descripcion, precio, Stock, categoria, imagen]);

        res.status(201).json({ message: 'Producto insertado exitosamente' });
    } catch (err) {
        console.error('Error al insertar el producto:', err);
        res.status(500).json({ error: 'Error al insertar el producto' });
    }
});

//Get productos para pantalla mis productos del vendedor
app.get('/productos/:userId', async (req, res) => {
	const userId = req.params.userId;


   try {
       // Si el userId es 44, traemos todos los productos
        if (userId === '44') {
            // Traemos todos los productos y el nombre del vendedor
            const [productosRows] = await pool.query('SELECT p.Nombre, p.Descripcion, p.Precio, p.Stock,p.Categoria, pr.NombreEmpresa AS VendedorNombre FROM Productos p JOIN Productores pr ON p.ProductorID = pr.ProductorID');

            res.json(productosRows);
        } else {
            // Si no es 44, traemos los productos del productor correspondiente
            const [productorRows] = await pool.query('SELECT ProductorID FROM Productores WHERE UsuarioID = ?', [userId]);

            // Si no encontramos el productor, respondemos con un error
            if (productorRows.length === 0) {
                return res.status(404).json({ message: 'Productor no encontrado' });
            }

            const productorId = productorRows[0]?.ProductorID;
	      // Traemos los productos del productor con stock > 0
            const [productoRows] = await pool.query('SELECT * FROM Productos WHERE ProductorID = ? AND Stock > 0', [productorId]);

            res.json(productoRows);
        }
    } catch (error) {
        console.error(error);
        res.status(500).end(); // En caso de error en la consulta
    }
});



// Ruta para obtener productos de un productor por su ProductorID
app.get('/api/productos/productor/:productorId', async (req, res) => {
    const productorId = req.params.productorId; 

    try {
        // Consulta para obtener los productos asociados al ProductorID
        const [productoRows] = await pool.query(
            'SELECT ProductoID, Nombre, Descripcion, Precio FROM Productos WHERE ProductorID = ? AND Stock > 0', 
            [productorId]
        );

        // Verificar si hay productos
        if (productoRows.length > 0) {
            res.json(productoRows); // Enviar la lista de productos
        } else {
            res.status(404).json({ error: 'No se encontraron productos para este productor' });
        }
    } catch (error) {
        console.error('Error al obtener productos del productor:', error);
        res.status(500).json({ error: 'Error al obtener los productos' });
    }
});




// Obtener la imagen de un producto
app.get('/api/producto/imagen/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        const [rows] = await pool.query('SELECT Imagen FROM Productos WHERE ProductoID = ? limit 10', [productId]);

        if (rows.length > 0) {
            const imagenData = rows[0].Imagen;

            if (!imagenData) {
                return res.status(404).json({ error: 'Imagen no encontrada' });
            }

            res.set('Content-Type', 'image/jpg');  // O 'image/png' si la imagen es PNG
            res.send(imagenData);  // Aquí estás enviando los datos de la imagen directamente
        } else {
            res.status(404).json({ error: 'Producto no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la imagen' });
    }
});

// Ruta para obtener las calificaciones de un producto
app.get('/api/calificaciones/:productoId', async (req, res) => {
    const productoId = req.params.productoId;

    try {
        // Obtener todas las calificaciones del producto
        const [rows] = await pool.query('SELECT c.Calificacion, c.Comentario, u.Nombre AS UsuarioNombre FROM Calificaciones c JOIN Usuarios u ON c.UsuarioID = u.UsuarioID WHERE c.ProductoID = ?', [productoId]);

        // Verificar si se encontraron calificaciones
        if (rows.length > 0) {
            res.json(rows);  // Enviar las calificaciones encontradas
        } else {
            res.status(200).json([]);  // Enviar array vacío si no hay calificaciones
        }
    } catch (error) {
        console.error('Error al obtener las calificaciones:', error);
        res.status(500).json({ error: 'Error al obtener las calificaciones' });
    }
});

//Get información de todos los usuarios pestañan de superusuario
app.get('/api/usuarios/', async (req, res) => {
    try {
        // Consulta para obtener los datos de todos los usuarios
        const [usuarioRows] = await pool.query(
            'SELECT u.UsuarioID,u.Nombre, u.rol, u.Telefono, u.Email from Usuarios u'
        );

        // Verificar si se encontraron usuarios
        if (usuarioRows.length > 0) {
            res.json(usuarioRows); // Devolver todos los usuarios como un array
        } else {
            res.status(404).json({ error: 'No se encontraron usuarios' });
        }
    } catch (error) {
        console.error('Error al obtener datos de los usuarios:', error);
        res.status(500).json({ error: 'Error al obtener los datos de los usuarios' });
    }
});


//Get compras por cliente
app.get('/api/compras/:clienteId', async (req, res) => {
    const clienteId = req.params.clienteId;
    console.log(`Recibiendo solicitudes para cliente con ID: ${clienteId}`);

    try {
        const query = 'CALL Get_Compras_Cliente(?)';
        const values = [clienteId];
        const [rows] = await pool.query(query, values);

        console.log('Compras encontradas:', rows); // Imprime los resultados de la consulta

        if (rows.length > 0) {
            res.json(rows);  // Enviar las compras encontradas
        } else {
            res.json([]);  // Si no se encontraron compras, enviar un array vacío
        }
    } catch (error) {
        console.error('Error al obtener las compras:', error);
        res.status(500).json({ error: 'Error al obtener las compras del cliente' });
    }
});

// Crear la orden y luego insertar los detalles
app.post('/api/orden', async (req, res) => {
    const { userId, total } = req.body;

    // Asegúrate de que el carrito esté en la sesión
    const carrito = req.session.carrito || []; // Usar el carrito de la sesión
    console.log("Carrito recibido:", JSON.stringify(carrito, null, 2));  // Imprimir el carrito para ver su formato

    //if (carrito.length === 0) {
    //    return res.status(400).send('El carrito está vacío.');
    //}

    try {
        // Llamar al procedimiento almacenado para crear la orden
        const [ordenResult] = await pool.query('CALL CrearOrden(?, ?, @OrdenID)', [userId || 1, total]);

        // Obtener el valor de la variable de salida @OrdenID
        const [result] = await pool.query('SELECT @OrdenID AS OrdenID');
        const ordenId = result[0].OrdenID;

        // Verificar que el ID de la orden está en el resultado
        if (!ordenId) {
            throw new Error('No se pudo obtener el ID de la orden.');
        }

        console.log("Orden ID creada api:", ordenId);

        res.status(201).json({ ordenId, message: 'Orden  con éxito' });
    } catch (error) {
        console.error('Error al crear la orden y los detalles:', error);
        res.status(500).send('Error al crear la orden y los detalles.');
    }
});
//Borrar del carrito
app.delete('/api/carrito/:productId', (req, res) => {
    const productId = parseInt(req.params.productId); // Asegurarse de que sea un número
    console.log(productId)

    // Filtrar para eliminar el producto del carrito
    const nuevoCarrito = req.session.carrito.filter(item => item.producto_id !== productId);

    // Verificar si hubo cambios
    if (nuevoCarrito.length === req.session.carrito.length) {
        return res.status(404).json({ message: 'Producto no encontrado en el carrito.' });
    }

    req.session.carrito = nuevoCarrito; // Actualizar el carrito en la sesión
    res.json({ message: 'Producto eliminado del carrito exitosamente.' });
});

//DETALLE
// Crear los detalles de la orden
app.post('/api/detalle', async (req, res) => {
    const { order_id } = req.body;  // Recibimos solo el ID de la orden, ya que el carrito está en la sesión

    // Asegúrate de que el carrito esté en la sesión
    const carrito = req.session.carrito || []; // Usar el carrito de la sesión
    console.log("Carrito recibido:", JSON.stringify(carrito, null, 2));  // Verifica el contenido del carrito

    // Validar que el carrito no esté vacío
    if (carrito.length === 0) {
        return res.status(400).send('El carrito está vacío.');
    }

    try {
        // Recorrer el carrito y llamar al procedimiento almacenado CrearDetalle para cada producto
        for (const item of carrito) {
            const { producto_id, cantidad } = item;
            // Llamar al procedimiento almacenado para insertar el detalle
            const [detalleResult] = await pool.query('CALL CrearDetalle(?, ?, ?, @mensaje)', [order_id, producto_id, cantidad]);

            // Obtener el valor de la variable de salida @mensaje
            const [result] = await pool.query('SELECT @mensaje AS mensaje');
            const mensaje = result[0].mensaje;

            // Verificar si el mensaje tiene algún error
            if (!mensaje || mensaje.includes("Error")) {
                throw new Error(mensaje || 'Error desconocido al insertar el detalle.');
            }
        }

        res.status(201).json({ message: 'Detalles insertados correctamente en la orden' });
    } catch (error) {
        console.error('Error al insertar los detalles de la orden:', error);
        res.status(500).send('Error al insertar los detalles de la orden.');
    }
});





//Entrega
app.post('/api/entrega', async (req, res) => {
    const { ordenId, entrega } = req.body;

    // Validar que el ordenId esté presente
    if (!ordenId) {
        return res.status(400).send('El ID de la orden es obligatorio.');
    }

    // Validar que la información de entrega esté completa
    if (!entrega || !entrega.nombre || !entrega.direccion || !entrega.telefono || !entrega.metodoPago || !entrega.metodoEntrega) {
        return res.status(400).send('Faltan datos de entrega.');
    }

    try {
        // Insertar los datos de entrega en la tabla
        await pool.query(
            'INSERT INTO DatosEntrega (OrdenID, Nombre, Direccion, Telefono, MetodoPago, MetodoEntrega, Instrucciones) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                ordenId,
                entrega.nombre,
                entrega.direccion,
                entrega.telefono,
                entrega.metodoPago,
                entrega.metodoEntrega,
                entrega.instrucciones || null // Las instrucciones pueden ser opcionales
            ]
        );

        res.status(201).send('Datos de entrega registrados con éxito.');
    } catch (error) {
        console.error('Error al registrar los datos de entrega:', error);
        res.status(500).send('Error al registrar los datos de entrega.');
    }
});


// Ruta para obtener la información del vendedor por ProductoID
app.get('/api/vendedores/info/:ordenId', async (req, res) => {
    const { ordenId } = req.params;
	console.log('OrdenID recibido:', ordenId);
    try {
        const [rows] = await pool.query(`
           SELECT DISTINCT 
                pr.nombre,
                p.NombreEmpresa, 
                p.Contacto, 
                p.Ubicacion,
                u.Email 
            FROM 
                OrdenDetalle od
            JOIN 
                Productos pr ON od.ProductoID = pr.ProductoID
            JOIN 
                Productores p ON pr.ProductorID = p.ProductorID
            JOIN Usuarios u ON u.UsuarioID = p.UsuarioID 
            WHERE 
                od.OrdenID  = ?
        `, [ordenId]);

        res.json(rows);
	console.log('Resultado de la consulta:', rows);
    } catch (error) {
        console.error('Error al obtener información de los vendedores:', error);
        res.status(500).json({ error: 'Error al obtener información de los vendedores' });
    }
});

// Ruta para obtener la información del comprador por OrdenID
app.get('/api/compradores/info/:ordenId', async (req, res) => {
    const { ordenId } = req.params;

    try {
        const [rows] = await pool.query(`
            SELECT 
                Nombre, 
                Telefono, 
                Direccion,
                MetodoPago,
                MetodoEntrega,
                Instrucciones
            FROM 
                DatosEntrega
            WHERE 
                OrdenID = ?
        `, [ordenId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No se encontró información del comprador para esta orden.' });
        }

        res.json(rows[0]); // Enviar el primer resultado, suponiendo que solo hay un comprador por orden
    } catch (error) {
        console.error('Error al obtener información del comprador:', error);
        res.status(500).json({ error: 'Error al obtener información del comprador.' });
    }
});



app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en http://0.0.0.0:${PORT}`);
});


