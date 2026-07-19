import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
} from "playwright";
import { NodeRedEditor } from "@/sdk/test/client/e2e";
import { FIXTURE_FLOW } from "./global-setup";

const BROWSERS: Array<{ name: string; type: BrowserType }> = [
  { name: "chromium", type: chromium },
  { name: "firefox", type: firefox },
  { name: "webkit", type: webkit },
];

describe.each(BROWSERS)(
  "Node-RED form components ($name)",
  ({ name, type }) => {
    let browser: Browser;
    let editor: NodeRedEditor;

    beforeAll(async () => {
      browser = await type.launch();
      // 2x so the docs screenshot captured below is crisp on retina displays.
      const page = await browser.newPage({ deviceScaleFactor: 2 });
      editor = new NodeRedEditor(page, Number(process.env.NODE_RED_PORT), {
        screenshotDir: "test-results/screenshots",
      });
      await editor.open();
    });

    afterAll(async () => {
      await browser.close();
    });

    afterEach(async () => {
      await editor.closeAllTrays();
      editor.expectNoPageErrors();
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
      // Every non-`Optional` field is marked with a `*`, whatever its type — so a
      // non-Optional number (Count) gets one. The built-in Name, by contrast, is
      // optional and shows none.
      const countField = editor.field("Count");
      await countField.expectVisible();
      await countField.scrollIntoView();
      expect(await countField.requiredIndicator.isVisible()).toBe(true);
      expect(await countField.requiredIndicator.textContent()).toBe("*");
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

    test("node status text renders under the node", async () => {
      await expect
        .poll(() => editor.getNodeStatus("n1"), { timeout: 10_000 })
        .toBe("ready");
    });

    test("code editor value can be read and written", async () => {
      await editor.editNode("n1");
      const template = editor.field("Template");
      await template.expectVisible();
      await template.scrollIntoView();
      expect(await template.getEditorValue()).toBe("<p>Hello</p>");

      await template.setEditorValue("<div>updated</div>");
      expect(await template.getEditorValue()).toBe("<div>updated</div>");
      await editor.clickCancel();
    });

    test("custom Vue form component renders with autocomplete suggestions", async () => {
      await editor.editNode("n2");
      const sobject = editor.field("SObject");
      await sobject.expectVisible();

      const suggestions = await sobject.getAutoCompleteSuggestions("Acc");
      expect(suggestions).toEqual(["Account", "AccountContactRole"]);

      await editor.screenshot(`${name}-custom-form-component`);
      await editor.clickCancel();
    });

    test("creates a config node from the node editor", async () => {
      await editor.editNode("n1");
      const server = editor.field("Server");
      await server.scrollIntoView();
      await server.openAddConfig();

      // fields here resolve inside the config tray stacked above the node tray
      await editor.field("Name").fill("E2E Server");
      await editor.field("Host").fill("example.com");
      await editor.clickConfigDone();

      await expect
        .poll(() => server.getSelectedOptionLabel())
        .toBe("E2E Server");
      await editor.clickDone();

      const node = await editor.getNode("n1");
      expect(node?.server).toMatch(/^[0-9a-f.]+$/);
    });

    test("toggling the error port adds an output port on the canvas", async () => {
      expect(await editor.getNodePortCount("n1")).toBe(1);

      await editor.editNode("n1");
      await editor.toggleLifecyclePort("Error Port");
      await editor.clickDone();
      await expect.poll(() => editor.getNodePortCount("n1")).toBe(2);

      await editor.editNode("n1");
      await editor.toggleLifecyclePort("Error Port");
      await editor.clickDone();
      await expect.poll(() => editor.getNodePortCount("n1")).toBe(1);
    });

    test("renders the sectioned ports form (Ports Settings + Lifecycle Output Ports)", async () => {
      await editor.editNode("n3");
      const tray = editor.page.locator(".red-ui-tray").last();
      // Ports Settings is a top-level section; Lifecycle Output Ports is a
      // subsection alongside Input/Outputs.
      const sectionTitles = await tray
        .locator(".nrg-section-title")
        .allInnerTexts();
      expect(sectionTitles).toEqual(expect.arrayContaining(["Ports Settings"]));
      // textContent (not innerText) — subsection titles are uppercased via CSS
      // text-transform, so innerText would read "LIFECYCLE OUTPUT PORTS".
      const subsectionTitles = (
        await tray.locator(".nrg-subsection-title").allTextContents()
      ).map((t) => t.trim());
      expect(subsectionTitles).toEqual(
        expect.arrayContaining(["Lifecycle Output Ports"]),
      );
      // the Outputs table renders one row for the single base output port
      expect(await tray.locator(".nrg-outputs tbody tr").count()).toBe(1);
      // capture the basic node form once for the docs
      if (name === "chromium") {
        await editor.page.waitForTimeout(300);
        await tray.screenshot({ path: "docs/public/editor-form.png" });
      }
      await editor.clickCancel();
    });

    test("edited values persist on the node model after Done", async () => {
      await editor.editNode("n1");
      await editor.field("Name").fill("persisted-name");
      await editor.clickDone();

      const node = await editor.getNode("n1");
      expect(node?.name).toBe("persisted-name");
    });

    test("deploy persists values to the runtime", async () => {
      await editor.editNode("n1");
      await editor.field("Name").fill("deployed-name");
      await editor.clickDone();
      await editor.clickDeploy();

      const flow = await editor.getDeployedFlow();
      const n1 = flow.find((n) => n.id === "n1") as Record<string, unknown>;
      expect(n1.name).toBe("deployed-name");

      // restore the pristine fixture flow (and reload) for subsequent suites
      await editor.deployFlow(FIXTURE_FLOW);
    });
  },
);
