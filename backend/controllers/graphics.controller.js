import { QueryTypes } from 'sequelize';
import db from '../db.js';
import { getDateCR } from '../libs/date.js';

// export const getAllDataFromGrpahic = async (req, res) => {
//     try {
//         const { LIMIT_PRODUCTS = 5, MIN_FEC = '', MAX_FEC = '', CATEGORY = '', FEC_CURRENT = '' } = req.query;

//         const min_f = validateDate(MIN_FEC);
//         const max_f = validateDate(MAX_FEC);
//         if (!min_f.isValid || !max_f.isValid) {
//             const message = "La fecha de inicio " + min_f.message + " y la fecha de corte " + max_f.message;
//             return res.status(400).json({ message: message })
//         }

//         let current_date = FEC_CURRENT;
//         if(FEC_CURRENT === ''){
//             current_date = await getDateCR();
//         }
//         const results = await db.query(
//             'CALL sp_getAllDataFromGrpahics(:MIN_FEC, :MAX_FEC, :LIMIT_PRODUCTS, :CATEGORY, :FEC_CURRENT)',
//             {
//                 replacements: {
//                     MIN_FEC: MIN_FEC,
//                     MAX_FEC: MAX_FEC,
//                     LIMIT_PRODUCTS: LIMIT_PRODUCTS,
//                     CATEGORY: CATEGORY,
//                     FEC_CURRENT: current_date
//                 },
//                 type: QueryTypes.SELECT
//             }
//         );

//         return res.json({ message: "Datos obtenidos con éxito.", top5Products: results[0], products_stock_sold: results[1], last12sales: results[2] })

//     } catch (error) {

//     }
// }

export const getAllDataFromGrpahic = async (req, res) => {
    try {
        const { LIMIT_PRODUCTS = 5, MIN_FEC = '', MAX_FEC = '', CATEGORY = '', FEC_CURRENT = '' } = req.query;

        const min_f = validateDate(MIN_FEC);
        const max_f = validateDate(MAX_FEC);
        if (!min_f.isValid || !max_f.isValid) {
            const message = "La fecha de inicio " + min_f.message + " y la fecha de corte " + max_f.message;
            return res.status(400).json({ message: message })
        }

        let current_date = FEC_CURRENT;
        if (FEC_CURRENT === '') {
            current_date = await getDateCR();
        }

        // Consulta 1: Top productos
        const top5Products = await db.query(`
            SELECT
                p.DSC_NOMBRE,
                SUM(dv.CANTIDAD) AS TOTAL_VENDIDO
            FROM
                tsit_detalleventa dv
            JOIN 
                tsim_producto p ON dv.ID_PRODUCTO = p.ID_PRODUCT
            JOIN 
                tsit_venta v ON dv.ID_VENTA = v.ID_VENTA
            WHERE 
                DATE(v.FEC_VENTA) BETWEEN :MIN_FEC AND :MAX_FEC
                AND (v.ESTADO = 1 OR v.ESTADO = 3)
            GROUP 
                BY p.DSC_NOMBRE
            ORDER 
                BY TOTAL_VENDIDO DESC
            LIMIT :LIMIT_PRODUCTS;
        `, {
            replacements: {
                MIN_FEC,
                MAX_FEC,
                LIMIT_PRODUCTS: parseInt(LIMIT_PRODUCTS, 10)
              },              
            type: QueryTypes.SELECT
        });

        // Consulta 2: Inventario y ventas por categoría
        const products_stock_sold = await db.query(`
            SELECT 
                p.DSC_NOMBRE,
                p.CANTIDAD,
                SUM(dv.CANTIDAD) AS TOTAL_VENDIDO
            FROM
                tsit_detalleventa dv
            JOIN tsim_producto p ON dv.ID_PRODUCTO = p.ID_PRODUCT
            JOIN tsit_venta v ON dv.ID_VENTA = v.ID_VENTA
            JOIN tsim_subcategoria subc ON p.ID_SUBCATEGORIA = subc.ID_SUBCATEGORIA
            JOIN tsim_categoria cat ON subc.ID_CATEGORIA = cat.ID_CATEGORIA
            WHERE DATE(v.FEC_VENTA) BETWEEN :MIN_FEC AND :MAX_FEC
                AND (v.ESTADO = 1 OR v.ESTADO = 3)
                AND (subc.DSC_NOMBRE LIKE :CATEGORY OR cat.DSC_NOMBRE LIKE :CATEGORY)
            GROUP BY p.DSC_NOMBRE, p.CANTIDAD
            ORDER BY TOTAL_VENDIDO DESC;
        `, {
            replacements: {
                MIN_FEC,
                MAX_FEC,
                CATEGORY: `%${CATEGORY}%`
            },
            type: QueryTypes.SELECT
        });

        // Consulta 3: Ventas últimos 12 meses
        const last12sales = await db.query(`
            WITH meses AS (
                SELECT DATE_FORMAT(DATE_SUB(:FEC_CURRENT, INTERVAL n MONTH), '%Y-%m') AS Mes
                FROM (
                    SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL 
                    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL 
                    SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11
                ) AS numeros
            ),
            ventas_contado AS (
                SELECT DATE_FORMAT(FEC_VENTA, '%Y-%m') AS Mes,
                    SUM((MONT_SUBTOTAL - (MONT_SUBTOTAL * (PORCENT_DESCUENTO / 100))) * (1 + PORCENT_IMPUESTO / 100)) AS TotalContado
                FROM tsit_venta
                WHERE ESTADO = 1 AND ESTADO_CREDITO = 0
                    AND FEC_VENTA BETWEEN DATE_SUB(:FEC_CURRENT, INTERVAL 11 MONTH) AND :FEC_CURRENT
                GROUP BY DATE_FORMAT(FEC_VENTA, '%Y-%m')
            ),
            abonos_credito AS (
                SELECT DATE_FORMAT(v.FEC_VENTA, '%Y-%m') AS Mes,
                    SUM(ab.MON_ABONADO) AS TotalAbonos
                FROM tsit_credito cred
                JOIN tsit_abono ab ON cred.ID_CREDITO = ab.ID_CREDITO
                JOIN tsit_venta v ON v.ID_VENTA = cred.ID_VENTA
                WHERE v.ESTADO IN (1, 3) AND v.ESTADO_CREDITO = 1
                    AND v.FEC_VENTA BETWEEN DATE_SUB(:FEC_CURRENT, INTERVAL 11 MONTH) AND :FEC_CURRENT
                GROUP BY DATE_FORMAT(v.FEC_VENTA, '%Y-%m')
            )
            SELECT 
                m.Mes,
                COALESCE(vc.TotalContado, 0) AS VentasContado,
                COALESCE(ac.TotalAbonos, 0) AS AbonosCredito,
                COALESCE(vc.TotalContado, 0) + COALESCE(ac.TotalAbonos, 0) AS TotalRecaudado
            FROM meses m
            LEFT JOIN ventas_contado vc ON vc.Mes = m.Mes
            LEFT JOIN abonos_credito ac ON ac.Mes = m.Mes
            ORDER BY m.Mes ASC;
        `, {
            replacements: { FEC_CURRENT: current_date },
            type: QueryTypes.SELECT
        });

        return res.json({
            message: "Datos obtenidos con éxito.",
            top5Products,
            products_stock_sold,
            last12sales
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error del servidor." });
    }
}


function validateDate(dateString) {
    const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
    if (!validFormat) {
        return { isValid: false, message: 'tiene un formato inválido. Debe ser AAAA-MM-DD.' };
    }

    const dateObject = new Date(dateString);
    if (isNaN(dateObject.getTime())) {
        return { isValid: false, message: 'proporcionada no es válida.' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dateObject.setHours(0, 0, 0, 0);

    if (dateObject > today) {
        return { isValid: false, message: 'no puede ser futura.' };
    }

    return { isValid: true, message: 'es válida.' };

}