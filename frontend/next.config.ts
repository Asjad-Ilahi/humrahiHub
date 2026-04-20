import type { NextConfig } from "next";
import path from "path";

/**
 * `next dev --webpack` often fails to resolve `permissionless` package exports from Privy.
 * Webpack aliases below fix that. Next 16 needs a `turbopack` key when `webpack` is customized.
 *
 * Do not use Turbopack `resolveAlias` with absolute Windows paths — it errors with
 * "windows imports are not implemented yet".
 */
const permissionlessRoot = path.join(process.cwd(), "node_modules", "permissionless");

const permissionlessAliases: Record<string, string> = {
  permissionless: path.join(permissionlessRoot, "_esm", "index.js"),
  "permissionless/accounts": path.join(permissionlessRoot, "_esm", "accounts", "index.js"),
  "permissionless/clients/pimlico": path.join(permissionlessRoot, "_esm", "clients", "pimlico.js"),
};

let supabaseImageHost: string | undefined;
try {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (u) supabaseImageHost = new URL(u).hostname;
} catch {
  supabaseImageHost = undefined;
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.qrserver.com",
        pathname: "/v1/create-qr-code/**",
      },
      ...(supabaseImageHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseImageHost,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
  transpilePackages: ["permissionless", "@privy-io/react-auth"],
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string | false | string[]>),
      ...permissionlessAliases,
    };
    return config;
  },
};

export default nextConfig;
