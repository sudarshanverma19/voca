// For Android Emulator, use 'http://10.0.2.2:8000'
// For Real Device on same Wi-Fi, use your local IP (e.g., 'http://192.168.1.10:8000')
const SERVER_IP = '192.168.1.5';

export const API_URL =
  import.meta.env.VITE_API_URL || `http://${SERVER_IP}:8000`;

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || `http://${SERVER_IP}:3001`;

