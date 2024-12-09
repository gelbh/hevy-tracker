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

Format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- feat: New features
- fix: Bug fixes
- refactor: Code restructuring
- docs: Documentation
- style: Formatting
- test: Testing
- chore: Maintenance

Example:

```
feat(workouts): add weight tracking functionality

- Implements weight logging feature
- Adds validation for weight inputs
- Updates UI to show weight history

Resolves #123
```

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

Before submitting:

1. Test with different authorization states
2. Verify error handling
3. Check quota limitations
4. Test with various data sizes
5. Verify UI responsiveness

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
