// Mock for SpreadsheetApp
class MockSpreadsheet {
  constructor() {
    this.sheets = [];
  }

  getSheetByName(name) {
    return this.sheets.find(sheet => sheet.getName() === name) || null;
  }

  getSheets() {
    return this.sheets;
  }

  getName() {
    return 'Mock Spreadsheet';
  }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
  }

  getName() {
    return this.name;
  }

  getRange(row, col, numRows, numCols) {
    return new MockRange(this, row, col, numRows, numCols);
  }

  getLastRow() {
    return this.data.length;
  }

  getLastColumn() {
    return this.data[0] ? this.data[0].length : 0;
  }

  appendRow(rowData) {
    this.data.push(rowData);
  }
}

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows || 1;
    this.numCols = numCols || 1;
  }

  getValues() {
    const values = [];
    for (let i = 0; i < this.numRows; i++) {
      const rowData = this.sheet.data[this.row - 1 + i] || [];
      values.push(rowData.slice(this.col - 1, this.col - 1 + this.numCols));
    }
    return values;
  }

  setValues(values) {
    for (let i = 0; i < values.length; i++) {
      if (!this.sheet.data[this.row - 1 + i]) {
        this.sheet.data[this.row - 1 + i] = [];
      }
      for (let j = 0; j < values[i].length; j++) {
        this.sheet.data[this.row - 1 + i][this.col - 1 + j] = values[i][j];
      }
    }
  }

  getValue() {
    return this.getValues()[0][0];
  }

  setValue(value) {
    this.setValues([[value]]);
  }
}

module.exports = {
  MockSpreadsheet,
  MockSheet,
  MockRange
};
