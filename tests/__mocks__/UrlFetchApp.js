// Mock for UrlFetchApp
class MockHTTPResponse {
  constructor(content, responseCode = 200, headers = {}) {
    this.content = content;
    this.responseCode = responseCode;
    this.headers = headers;
  }

  getContentText() {
    return typeof this.content === 'string' ? this.content : JSON.stringify(this.content);
  }

  getResponseCode() {
    return this.responseCode;
  }

  getHeaders() {
    return this.headers;
  }

  getBlob() {
    return this.content;
  }
}

const fetch = jest.fn((url, params = {}) => {
  return new MockHTTPResponse({ success: true }, 200, {});
});

module.exports = {
  fetch,
  MockHTTPResponse
};
