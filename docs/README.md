<p align="center">
  <img src="../assets/logo.png" width="80" alt="Grat Logo" />
</p>

# Grat Documentation

This directory contains the Mintlify-powered documentation for Grat.

## Running Locally

1. Install the Mintlify CLI:
   ```bash
   npm i -g mintlify
   ```

2. Run the development server from the **root** of the project:
   ```bash
   mintlify dev
   ```

The docs will be available at `http://localhost:3000`.

## Structure

- `mint.json`: The global configuration and navigation tree.
- `openapi.json`: The API specification.
- `snippets/`: Reusable MDX components.
- `core-concepts/`: Theoretical deep-dives.
- `guides/`: Practical tutorials and migrations.
- `api-reference/`: Endpoint-specific documentation.
- `sdks/`: Language-specific client guides.

## Deployment

Changes to the `main` branch are automatically deployed to `docs.grat.network`.

## Support & Contact

- **Twitter**: [@gratnetworkHq](https://x.com/gratnetworkHq)
- **Email**: [gratnetworkofficial@gmail.com](mailto:gratnetworkofficial@gmail.com)
