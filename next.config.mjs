/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a Node builtin; keep it out of the bundler.
  serverExternalPackages: ["node:sqlite"],
};

export default nextConfig;
