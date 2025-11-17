// Mock for PropertiesService
class MockProperties {
  constructor() {
    this.properties = {};
  }

  getProperty(key) {
    return this.properties[key] || null;
  }

  setProperty(key, value) {
    this.properties[key] = value;
  }

  deleteProperty(key) {
    delete this.properties[key];
  }

  getKeys() {
    return Object.keys(this.properties);
  }

  getProperties() {
    return { ...this.properties };
  }

  deleteAllProperties() {
    this.properties = {};
  }
}

const scriptProperties = new MockProperties();
const userProperties = new MockProperties();
const documentProperties = new MockProperties();

module.exports = {
  getScriptProperties: () => scriptProperties,
  getUserProperties: () => userProperties,
  getDocumentProperties: () => documentProperties,
  MockProperties
};
