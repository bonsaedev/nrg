import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import fs from "fs";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
} from "playwright";
import { NodeRedEditor } from "./helpers";
import { PORT_FILE } from "./global-setup";

const PORT = (): number => {
  return Number(fs.readFileSync(PORT_FILE, "utf-8").trim());
};

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
    editor = new NodeRedEditor(page, PORT(), {
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
    expect(await nameField.input.inputValue()).toBe("E2E Node");
    await nameField.clear();
    await editor.clickDone();
  });

  test("number input renders for integer field", async () => {
    await editor.editNode("n1");
    const count = editor.field("Count");
    await count.expectVisible();
    await count.scrollIntoView();
    expect(await count.input.getAttribute("type")).toBe("number");
    await editor.screenshot(`${name}-number-input-renders-for-integer-field`);
    await editor.clickCancel();
  });

  test("number input renders for float field", async () => {
    await editor.editNode("n1");
    const rate = editor.field("Rate");
    await rate.expectVisible();
    await rate.scrollIntoView();
    expect(await rate.input.getAttribute("type")).toBe("number");
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
    const container = color.row.locator(".red-ui-typedInput-container");
    expect(await container.isVisible()).toBe(true);
    await editor.screenshot(`${name}-select-input-renders-for-enum-field`);
    await editor.clickCancel();
  });

  test("typed input renders with all types", async () => {
    await editor.editNode("n1");
    const target = editor.field("Target");
    await target.expectVisible();
    await target.scrollIntoView();
    const container = target.row.locator(".red-ui-typedInput-container");
    expect(await container.isVisible()).toBe(true);
    await container.locator(".red-ui-typedInput-type-select").click();
    const menu = editor.page.locator(".red-ui-typedInput-options").last();
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    const items = menu.locator("a");
    expect(await items.count()).toBe(14);
    await editor.screenshot(`${name}-typed-input-all-types`);
    await editor.page.keyboard.press("Escape");
    await editor.clickCancel();
  });

  test("typed input renders with restricted types", async () => {
    await editor.editNode("n1");
    const source = editor.field("Source");
    await source.expectVisible();
    await source.scrollIntoView();
    const container = source.row.locator(".red-ui-typedInput-container");
    expect(await container.isVisible()).toBe(true);
    await container.locator(".red-ui-typedInput-type-select").click();
    const menu = editor.page.locator(".red-ui-typedInput-options").last();
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    const items = menu.locator("a");
    expect(await items.count()).toBe(3);
    const values = await items.evaluateAll((els) =>
      els.map((el) => el.getAttribute("value")),
    );
    expect(values).toEqual(["str", "num", "bool"]);
    await editor.screenshot(`${name}-typed-input-restricted-types`);
    await editor.page.keyboard.press("Escape");
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
    await editor.screenshot(`${name}-config-input-renders`);
    await editor.clickCancel();
  });

  test("shows validation error for empty required string", async () => {
    await editor.editNode("n1");
    const nameField = editor.field("Name");
    await nameField.expectVisible();
    await nameField.scrollIntoView();
    const error = nameField.errorMessage;
    await error.waitFor({ state: "visible", timeout: 5_000 });
    expect(await error.textContent()).toContain("must NOT have fewer than 1 characters");
    await editor.screenshot(`${name}-validation-error-empty-string`);
    await editor.clickCancel();
  });

  test("shows validation error for number below minimum", async () => {
    await editor.editNode("n1");
    const count = editor.field("Count");
    await count.expectVisible();
    await count.scrollIntoView();
    const error = count.errorMessage;
    await error.waitFor({ state: "visible", timeout: 5_000 });
    expect(await error.textContent()).toContain("must be >= 1");
    await editor.screenshot(`${name}-validation-error-below-minimum`);
    await editor.clickCancel();
  });

  test("validation error clears when valid value is entered", async () => {
    await editor.editNode("n1");
    const nameField = editor.field("Name");
    await nameField.expectVisible();
    await nameField.scrollIntoView();
    const error = nameField.errorMessage;
    await error.waitFor({ state: "visible", timeout: 5_000 });
    await nameField.fill("Valid Name");
    await error.waitFor({ state: "hidden", timeout: 5_000 });
    await editor.screenshot(`${name}-validation-error-cleared`);
    await nameField.clear();
    await editor.clickCancel();
  });

  test("shows validation error for number above maximum", async () => {
    await editor.editNode("n1");
    const count = editor.field("Count");
    await count.expectVisible();
    await count.scrollIntoView();
    await count.input.fill("200");
    const error = count.errorMessage;
    await error.waitFor({ state: "visible", timeout: 5_000 });
    expect(await error.textContent()).toContain("must be <= 100");
    await editor.screenshot(`${name}-validation-error-above-maximum`);
    await editor.clickCancel();
  });

  test("credential fields render with correct input types", async () => {
    await editor.editNode("n1");
    const apiKey = editor.field("Api Key");
    await apiKey.expectVisible();
    await apiKey.scrollIntoView();
    expect(await apiKey.input.getAttribute("type")).toBe("password");

    const token = editor.field("Token");
    await token.expectVisible();
    await token.scrollIntoView();
    expect(await token.input.getAttribute("type")).toBe("text");
    await editor.screenshot(`${name}-credential-fields-render`);
    await editor.clickCancel();
  });
});
