# Contributing to Hevy Tracker

We love your input! We want to make contributing to Hevy Tracker as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code follows the existing style
6. Issue that pull request!

## Code Style

- Use camelCase for functions and variables
- Use PascalCase for class names
- Use UPPER_SNAKE_CASE for constants
- Follow Google Apps Script best practices

### Git Commit Messages

**IMPORTANT:** Commit messages must be a **single line** with the following format:

```
type(scope): description
```

**Rules:**
- **Single line only** - no body or footer
- **Type** (required): feat, fix, refactor, docs, style, test, chore
- **Scope** (optional): lowercase, no spaces - e.g., (workouts), (api), (ui)
- **Description**: start with lowercase letter, no period at end
- **Maximum length**: 72 characters

**Valid examples:**

```
feat(workouts): add weight tracking
fix(api): resolve rate limit error
refactor(utils): extract common functions
docs(readme): update installation steps
```

**Invalid examples:**

```
# ❌ Has body/footer
feat(workouts): add weight tracking

Implements weight logging feature

# ❌ Missing type
add weight tracking

# ❌ Wrong case
FEAT(workouts): ADD WEIGHT TRACKING

# ❌ Period at end
feat(workouts): add weight tracking.
```

**Note:** Git hooks will automatically validate your commit messages. If validation fails, you'll see a helpful error message with the format requirements.

## Error Handling

Always use the ErrorHandler.gs system with appropriate error types:

```javascript
try {
  // Your code here
} catch (error) {
  throw ErrorHandler.handle(error, {
    operation: "Operation name",
    context: "Additional context",
  });
}
```

## Documentation

- Include JSDoc comments for all functions
- Document complex logic with inline comments
- Update README.md for significant changes
- Keep documentation up to date

## Testing

We use Jest for unit testing with mocks for Google Apps Script APIs.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Writing Tests

Tests are located in the `tests/` directory. We provide mocks for common Google Apps Script APIs:

- `SpreadsheetApp`
- `UrlFetchApp`
- `PropertiesService`
- `Logger`
- `Utilities`

Example test:

```javascript
describe('My Feature', () => {
  test('should work correctly', () => {
    const result = myFunction();
    expect(result).toBe(expectedValue);
  });
});
```

### Pre-Push Testing

Before pushing to the repository:

1. **Automated tests run via pre-push hook** - All tests must pass
2. Test with different authorization states
3. Verify error handling
4. Check quota limitations
5. Test with various data sizes
6. Verify UI responsiveness

**Note:** To bypass the pre-push hook (not recommended): `git push --no-verify`

### Continuous Integration

All pull requests and pushes to main/develop branches automatically run:
- Test suite on Node.js 18.x and 20.x
- Commit message validation
- Coverage report generation

## Pull Request Process

1. Update documentation if needed
2. Update the README.md with details of changes
3. Update the version number following [SemVer](http://semver.org/)
4. The PR will be merged once reviewed and approved

## Any contributions you make will be under the MIT Software License

In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using GitHub's [issue tracker](https://github.com/gelbh/hevy-tracker/issues)

We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/gelbh/hevy-tracker/issues/new).

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening)

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
