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

/** Relative aliases for `next dev` (Turbopack) — avoids absolute Windows paths. */
const permissionlessTurbopackAliases: Record<string, string> = {
  permissionless: "./node_modules/permissionless/_esm/index.js",
  "permissionless/accounts": "./node_modules/permissionless/_esm/accounts/index.js",
  "permissionless/clients/pimlico": "./node_modules/permissionless/_esm/clients/pimlico.js",
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
  turbopack: {
    resolveAlias: permissionlessTurbopackAliases,
  },
  webpack: (config, { webpack: webpackApi }) => {
    const permMain = path.join(permissionlessRoot, "_esm", "index.js");
    const permAccounts = path.join(permissionlessRoot, "_esm", "accounts", "index.js");
    const permPimlico = path.join(permissionlessRoot, "_esm", "clients", "pimlico.js");

    /**
     * Privy's ESM chunks import `permissionless/accounts` etc. Webpack 5 sometimes
     * fails `package.json#exports` resolution from nested `.mjs`; force the real files.
     */
    config.plugins.push(
      new webpackApi.NormalModuleReplacementPlugin(/^permissionless\/accounts$/, permAccounts),
      new webpackApi.NormalModuleReplacementPlugin(/^permissionless\/clients\/pimlico$/, permPimlico),
      new webpackApi.NormalModuleReplacementPlugin(/^permissionless$/, permMain),
    );

    const existing = config.resolve.alias;
    if (Array.isArray(existing)) {
      existing.push(
        { name: "permissionless", alias: permMain },
        { name: "permissionless/accounts", alias: permAccounts },
        { name: "permissionless/clients/pimlico", alias: permPimlico },
      );
    } else {
      config.resolve.alias = {
        ...(existing as Record<string, string | false | string[] | undefined>),
        ...permissionlessAliases,
      };
    }
    return config;
  },
};

export default nextConfig;
