# Optional build CA

Only for networks behind a TLS-inspecting proxy: put the proxy CA here as `ca.pem`
and build with `--build-arg APT_HTTPS=1`. `*.pem` files in this folder are git-ignored.
