import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
} from "playwright";
import { NodeRedEditor } from "@/test/client/e2e";

const BROWSERS: Array<{ name: string; type: BrowserType }> = [
  { name: "chromium", type: chromium },
  { name: "firefox", type: firefox },
  { name: "webkit", type: webkit },
];

describe.each(BROWSERS)("Node-RED form components ($name)", ({ name, type }) => {
  let browser: Browser;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    browser = await type.launch();
    const page = await browser.newPage();
    editor = new NodeRedEditor(page, Number(process.env.NODE_RED_PORT), {
      screenshotDir: "test-results/screenshots",
    });
    await editor.open();
  });

  afterAll(async () => {
    await browser.close();
  });

  test("opens and closes the edit dialog", async () => {
    await editor.editNode("n1");
    expect(await editor.tray.isVisible()).toBe(true);
    await editor.screenshot(`${name}-opens-and-closes-the-edit-dialog`);
    await editor.clickCancel();
  });

  test("text input renders and accepts value", async () => {
    await editor.editNode("n1");
    const nameField = editor.field("Name");
    await nameField.expectVisible();
    await nameField.scrollIntoView();
    await nameField.fill("E2E Node");
    await editor.screenshot(`${name}-text-input-renders-and-accepts-value`);
    await editor.clickDone();

    await editor.editNode("n1");
    expect(await nameField.getValue()).toBe("E2E Node");
    await nameField.clear();
    await editor.clickDone();
  });

  test("number input renders for integer field", async () => {
    await editor.editNode("n1");
    const count = editor.field("Count");
    await count.expectVisible();
    await count.scrollIntoView();
    expect(await count.getInputType()).toBe("number");
    await editor.screenshot(`${name}-number-input-renders-for-integer-field`);
    await editor.clickCancel();
  });

  test("number input renders for float field", async () => {
    await editor.editNode("n1");
    const rate = editor.field("Rate");
    await rate.expectVisible();
    await rate.scrollIntoView();
    expect(await rate.getInputType()).toBe("number");
    await editor.screenshot(`${name}-number-input-renders-for-float-field`);
    await editor.clickCancel();
  });

  test("toggle renders for boolean field with toggle option", async () => {
    await editor.editNode("n1");
    const enabled = editor.field("Enabled");
    await enabled.expectVisible();
    await enabled.scrollIntoView();
    expect(await enabled.toggleSlider.isVisible()).toBe(true);
    await editor.screenshot(`${name}-toggle-renders-for-boolean-field`);
    await editor.clickCancel();
  });

  test("checkbox renders for boolean field without toggle option", async () => {
    await editor.editNode("n1");
    const active = editor.field("Active");
    await active.expectVisible();
    await active.scrollIntoView();
    expect(await active.checkbox.isVisible()).toBe(true);
    await editor.screenshot(`${name}-checkbox-renders-for-boolean-field`);
    await editor.clickCancel();
  });

  test("select input renders for enum field", async () => {
    await editor.editNode("n1");
    const color = editor.field("Color");
    await color.expectVisible();
    await color.scrollIntoView();
    expect(await color.typedInputContainer.isVisible()).toBe(true);
    const labels = await color.getOptionMenuLabels();
    expect(labels).toEqual(["red", "green", "blue"]);
    await editor.screenshot(`${name}-select-input-renders-for-enum-field`);
    await editor.clickCancel();
  });

  test("typed input renders with all types", async () => {
    await editor.editNode("n1");
    const target = editor.field("Target");
    await target.expectVisible();
    await target.scrollIntoView();
    expect(await target.typedInputContainer.isVisible()).toBe(true);
    const values = await target.getTypeMenuValues();
    expect(values).toHaveLength(14);
    await editor.screenshot(`${name}-typed-input-all-types`);
    await editor.clickCancel();
  });

  test("typed input renders with restricted types", async () => {
    await editor.editNode("n1");
    const source = editor.field("Source");
    await source.expectVisible();
    await source.scrollIntoView();
    expect(await source.typedInputContainer.isVisible()).toBe(true);
    const values = await source.getTypeMenuValues();
    expect(values).toEqual(["str", "num", "bool"]);
    await editor.screenshot(`${name}-typed-input-restricted-types`);
    await editor.clickCancel();
  });

  test("multi-select renders for array with enum items", async () => {
    await editor.editNode("n1");
    const tags = editor.field("Tags");
    await tags.expectVisible();
    await tags.scrollIntoView();
    expect(await tags.typedInputContainer.isVisible()).toBe(true);
    const labels = await tags.getOptionMenuLabels();
    expect(labels).toEqual(["frontend", "backend", "devops"]);
    await editor.screenshot(`${name}-multi-select-renders`);
    await editor.clickCancel();
  });

  test("array-text renders textarea for plain array field", async () => {
    await editor.editNode("n1");
    const recipients = editor.field("Recipients");
    await recipients.expectVisible();
    await recipients.scrollIntoView();
    expect(await recipients.textarea.isVisible()).toBe(true);
    const hint = recipients.row.locator("span", {
      hasText: "One entry per line",
    });
    expect(await hint.isVisible()).toBe(true);
    await editor.screenshot(`${name}-array-text-textarea-renders`);
    await editor.clickCancel();
  });

  test("code editor renders for string with editorLanguage", async () => {
    await editor.editNode("n1");
    const template = editor.field("Template");
    await template.expectVisible();
    await template.scrollIntoView();
    expect(await template.editorWrapper.isVisible()).toBe(true);
    expect(await template.expandButton.isVisible()).toBe(true);
    await editor.screenshot(`${name}-code-editor-renders`);
    await editor.clickCancel();
  });

  test("config input renders for NodeRef field", async () => {
    await editor.editNode("n1");
    const server = editor.field("Server");
    await server.expectVisible();
    await server.scrollIntoView();
    expect(await server.select.isVisible()).toBe(true);
    expect(await server.editButton.isVisible()).toBe(true);
    expect(await server.addButton.isVisible()).toBe(true);
    const options = await server.getOptions();
    expect(options).toContain("Test Server");
    await editor.screenshot(`${name}-config-input-renders`);
    await editor.clickCancel();
  });

  test("required fields show asterisk indicator", async () => {
    await editor.editNode("n1");
    const nameField = editor.field("Name");
    await nameField.expectVisible();
    await nameField.scrollIntoView();
    expect(await nameField.requiredIndicator.isVisible()).toBe(true);
    expect(await nameField.requiredIndicator.textContent()).toBe("*");
    await editor.screenshot(`${name}-required-indicator`);
    await editor.clickCancel();
  });

  test("shows validation error for empty required string", async () => {
    await editor.editNode("n1");
    const nameField = editor.field("Name");
    await nameField.expectVisible();
    await nameField.scrollIntoView();
    await nameField.expectError("must NOT have fewer than 1 characters");
    await editor.screenshot(`${name}-validation-error-empty-string`);
    await editor.clickCancel();
  });

  test("shows validation error for number below minimum", async () => {
    await editor.editNode("n1");
    const count = editor.field("Count");
    await count.expectVisible();
    await count.scrollIntoView();
    await count.expectError("must be >= 1");
    await editor.screenshot(`${name}-validation-error-below-minimum`);
    await editor.clickCancel();
  });

  test("validation error clears when valid value is entered", async () => {
    await editor.editNode("n1");
    const nameField = editor.field("Name");
    await nameField.expectVisible();
    await nameField.scrollIntoView();
    await nameField.expectError();
    await nameField.fill("Valid Name");
    await nameField.expectNoError();
    await editor.screenshot(`${name}-validation-error-cleared`);
    await nameField.clear();
    await editor.clickCancel();
  });

  test("shows validation error for number above maximum", async () => {
    await editor.editNode("n1");
    const count = editor.field("Count");
    await count.expectVisible();
    await count.scrollIntoView();
    await count.fill("200");
    await count.expectError("must be <= 100");
    await editor.screenshot(`${name}-validation-error-above-maximum`);
    await editor.clickCancel();
  });

  test("credential fields render with correct input types", async () => {
    await editor.editNode("n1");
    const apiKey = editor.field("Api Key");
    await apiKey.expectVisible();
    await apiKey.scrollIntoView();
    expect(await apiKey.getInputType()).toBe("password");

    const token = editor.field("Token");
    await token.expectVisible();
    await token.scrollIntoView();
    expect(await token.getInputType()).toBe("text");
    await editor.screenshot(`${name}-credential-fields-render`);
    await editor.clickCancel();
  });
});
