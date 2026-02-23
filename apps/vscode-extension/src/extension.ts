import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Tiqora extension activated');
  vscode.window.showInformationMessage('Tiqora is ready');
}

export function deactivate() {}
