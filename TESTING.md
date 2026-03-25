# Testing Guide for @royalfig/gtb

This document describes the testing setup for the Ghost Theme Builder utility.

## Overview

The project uses **Vitest** as its testing framework, which provides:
- Native TypeScript support
- Fast execution with Jest-compatible API
- Built-in mocking capabilities
- Excellent coverage reporting
- Integration with esbuild

## Installation

Testing dependencies are already included in the project. If you need to install them manually:

```bash
npm install --save-dev vitest @vitest/ui jsdom vite
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests with UI
```bash
npm run test:ui
```

This opens a web-based UI for interactive test exploration.

### Run tests with coverage
```bash
npm run test:coverage
```

Coverage reports will be generated in the `coverage/` directory.

### Run tests in watch mode
```bash
npm test -- --watch
```

## Test Structure

Tests are organized in the `src/__tests__` directory:

```
src/
├── __tests__/
│   ├── utils.test.ts      # Tests for utility functions
│   ├── builder.test.ts    # Tests for asset building
│   ├── server.test.ts     # Tests for WebSocket server
│   └── cli.test.ts        # Tests for CLI commands
├── cli.ts
├── builder.ts
├── server.ts
└── utils.ts
```

## Test Coverage Areas

### 1. Utils Tests (`utils.test.ts`)
Tests for utility functions:
- `formatBytes()` - Byte formatting
- `checkNodeVersion()` - Node.js compatibility
- `loadConfig()` - Configuration loading
- `findEntryPoints()` - Entry point detection
- `downloadFile()` - File downloading
- `hasCommand()` - Command availability
- `runCommand()` - Command execution
- `loadEnv()` - Environment variable loading
- `findFilesRecursively()` - File discovery

### 2. Builder Tests (`builder.test.ts`)
Tests for asset building:
- `writeAssets()` - Asset compilation
- `inlineCritical()` - Critical CSS/JS inlining
- Build result validation
- Error handling
- Custom configuration support

### 3. Server Tests (`server.test.ts`)
Tests for development server:
- `printCompilationDetails()` - Output formatting
- `printHeader()` - Header display
- `initWs()` - WebSocket initialization
- File watching and rebuilding
- WebSocket communication

### 4. CLI Tests (`cli.test.ts`)
Tests for CLI commands:
- `makeSkeleton()` - Theme scaffolding
- `parseGhostCliOutput()` - Ghost CLI parsing
- `checkTheme()` - Theme validation
- `lintTheme()` - Linting
- `zipTheme()` - Theme packaging
- `deployTheme()` - Deployment
- `runDoctor()` - Diagnostics
- `symLinkTheme()` - Symlink creation
- `cloneContent()` - Content cloning

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { functionName } from '../module.js';

describe('functionName', () => {
  it('should do something', () => {
    const result = functionName('input');
    expect(result).toBe('expected output');
  });
});
```

### Using Mocks

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('example', () => {
  it('should mock a function', () => {
    const mockFn = vi.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});
```

### Testing Async Code

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('async example', () => {
  it('should handle async operations', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
  });
});
```

## Coverage Configuration

Coverage is configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/__tests__/',
        '**/*.test.ts',
      ],
    },
  },
});
```

## Best Practices

1. **Test Pure Functions**: Functions without side effects should be fully tested
2. **Mock External Dependencies**: Use mocks for file system, network, and external APIs
3. **Test Edge Cases**: Include boundary conditions and error scenarios
4. **Keep Tests Independent**: Each test should run in isolation
5. **Use Descriptive Names**: Test names should clearly state what is being tested
6. **Avoid Testing Implementation Details**: Test behavior, not internal implementation

## Example Test

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatBytes } from '../utils.js';

describe('formatBytes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should format bytes to human-readable format', () => {
    expect(formatBytes(1024)).toBe('1.00 KiB');
    expect(formatBytes(1048576)).toBe('1.00 MiB');
  });

  it('should handle zero bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should handle custom decimals', () => {
    expect(formatBytes(1024, 0)).toBe('1 KiB');
    expect(formatBytes(1024, 4)).toBe('1.0000 KiB');
  });
});
```

## CI/CD Integration

Tests are automatically run in CI/CD pipelines. The test command is configured in `package.json`:

```json
{
  "scripts": {
    "test": "vitest"
  }
}
```

## Troubleshooting

### Tests fail with "Cannot find module"
Ensure all dependencies are installed:
```bash
npm install
```

### Coverage reports not generated
Make sure the coverage provider is installed:
```bash
npm install --save-dev @vitest/coverage-v8
```

### Tests timeout
Increase the timeout for slow tests:
```typescript
it('slow test', async () => {
  // test code
}, 10000); // 10 second timeout
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html)
- [Testing Best Practices](https://vitest.dev/guide/best-practices.html)