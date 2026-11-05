/** O navegador só fala com este servidor; /api/* é repassado à API (mesma origem = cookie de sessão funciona). */
module.exports = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:3001'}/:path*` }];
  },
};
