# PHPless

Serverless PHP hosting platform: Firecracker microVMs + FrankenPHP.

## Project Structure

- `panel/` — Laravel 12 + React/Inertia + shadcn/ui (management panel)
- `phpless-manager/` — Go daemon managing Firecracker VMs
- `cli/` — Go CLI + MCP server
- `rootfs/` — Firecracker rootfs init script
- `scripts/` — Build and deploy scripts

## API Documentation (Scramble)

The REST API uses [dedoc/scramble](https://scramble.dedoc.co) to auto-generate OpenAPI docs from code. The Swagger UI is served at `/docs/api`.

**When adding or modifying API endpoints in `panel/app/Http/Controllers/Api/V1/`:**

1. Add a PHPDoc block with `summary` (first line) and `description` (subsequent lines) to every public controller method:
   ```php
   /**
    * Short summary
    *
    * Longer description of what the endpoint does.
    */
   public function myEndpoint(Request $request): JsonResponse
   ```

2. For endpoints that don't require authentication, add `@unauthenticated`:
   ```php
   /**
    * Summary
    *
    * Description.
    *
    * @unauthenticated
    */
   ```

3. For binary/download responses, add `@response`:
   ```php
   /**
    * @response 200 scenario="Success" Binary file download.
    */
   ```

4. For helper methods that return arrays used in responses, add `@return` with array shape annotation so Scramble can infer the schema.

5. Scramble auto-detects request schemas from `$request->validate()` rules and multipart from file upload validation — no manual annotation needed for those.

6. Security scheme (Bearer token) is registered globally in `AppServiceProvider::boot()`.

7. Config is at `panel/config/scramble.php` (`api_path: api/v1`).
