/**
 * Configuración de Supabase para el cliente.
 *
 * SEGURIDAD: aquí SOLO va la clave "publishable", que es PÚBLICA por diseño —
 * pensada para ir en apps de cliente. La protección real de tus datos es
 * Row Level Security (RLS) + autenticación: sin iniciar sesión no se lee ni
 * escribe nada, y cada usuario solo ve sus propias filas.
 *
 * NUNCA pongas aquí la clave `service_role` ni `sb_secret_...`: cualquiera que
 * abra la app las vería. Este archivo se publica en un repo público.
 *
 * La clave publishable NO cambia si rotas el secreto JWT, por eso se usa esta
 * y no la `anon`.
 */
export const SUPABASE_URL = 'https://kkocgidjkxgxujrauqtq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_w5Wjxdu04Kym7yLamOmqhg_BMQ6Qo3w';
