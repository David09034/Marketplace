#!/usr/bin/env node
const nodemailer = require('nodemailer');

async function enviarCorreo({ correo, nombre, ordenId, total, carrito, entrega }) {

let transporter = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 465,
	secure: true,
	auth: {
		user: 'chugchilanmarketplace@gmail.com',
		pass: 'cfnr thew ekcw fomu'
		},
	});

let itemsHtml = carrito.map(item => `
        <p><strong>${item.nombre}</strong> - ${item.cantidad} x $${item.precio} = $${(item.cantidad * item.precio).toFixed(2)}</p>
    `).join('');

    let mailOptions = {
        from: 'chugchilanmarketplace@gmail.com',
        to: correo,
        subject: `Confirmación de Compra - Orden #${ordenId}`,
        html: `
            <h2>¡Gracias por tu compra, ${nombre}!</h2>
            <p>Detalles de tu pedido:</p>
            ${itemsHtml}
            <p><strong>Total: $${total.toFixed(2)}</strong></p>
            <p>Método de Pago: ${entrega.metodoPago}</p>
            <p>Método de Entrega: ${entrega.metodoEntrega}</p>
            <p>Dirección: ${entrega.direccion}</p>
            <p>Teléfono: ${entrega.telefono}</p>
            <p>Instrucciones: ${entrega.instrucciones}</p>
        `
    };

    await transporter.sendMail(mailOptions);
}

module.exports = { enviarCorreo };
