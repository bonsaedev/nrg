import fs from "node:fs";
import path from "node:path";
import type { Page, Locator } from "playwright";
import {
  NodeRedTestEnvironment,
  type NodeRedTestEnvironmentOptions,
} from "./environment";

export { NodeRedTestEnvironment, type NodeRedTestEnvironmentOptions };

export interface SetupOptions {
  settingsFile?: string;
  flow?: Record<string, unknown>[];
}

let _env: NodeRedTestEnvironment | null = null;

export async function setup(options?: SetupOptions): Promise<void> {
  const packageName = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
  ).name;

  _env = new NodeRedTestEnvironment({
    packageName,
    settingsFile: options?.settingsFile,
  });
  const port = await _env.setup();
  process.env.NODE_RED_PORT = String(port);

  if (options?.flow) {
    await _env.deployFlow(options.flow);
  }
}

export async function teardown(): Promise<void> {
  if (_env) {
    await _env.teardown();
    _env = null;
  }
  delete process.env.NODE_RED_PORT;
}

export class NodeRedEditor {
  readonly errors: string[] = [];
  private screenshotDir: string;

  constructor(
    readonly page: Page,
    readonly port: number,
    options?: { screenshotDir?: string },
  ) {
    this.screenshotDir = options?.screenshotDir ?? "test-results/screenshots";
    page.on("pageerror", (err) => {
      // "ResizeObserver loop ..." is a benign browser warning the editor and
      // jQuery typedInput widgets fire on rapid layout changes — never a real
      // failure, and unfixable in app code, so don't let it fail tests.
      if (err.message.includes("ResizeObserver")) return;
      this.errors.push(err.message);
    });
  }

  async screenshot(name: string): Promise<string> {
    fs.mkdirSync(this.screenshotDir, { recursive: true });
    const filePath = path.join(this.screenshotDir, `${name}.png`);
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  async open(): Promise<void> {
    await this.page.goto(`http://localhost:${this.port}`);
    await this.page.waitForSelector("#red-ui-workspace", { timeout: 30_000 });
    await this.page.waitForFunction(
      () => {
        const r = (globalThis as Record<string, unknown>).RED as any;
        return r && typeof r.editor?.edit === "function";
      },
      { timeout: 15_000 },
    );
  }

  async deployFlow(flow: Record<string, unknown>[]): Promise<void> {
    const res = await fetch(`http://localhost:${this.port}/flows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Node-RED-Deployment-Type": "full",
      },
      body: JSON.stringify(flow),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to deploy flow: ${res.status} ${await res.text()}`,
      );
    }
    await this.page.reload();
    await this.page.waitForSelector("#red-ui-workspace", { timeout: 15_000 });
  }

  async editNode(nodeId: string): Promise<void> {
    await this.page.waitForFunction(
      (id) => {
        const r = (globalThis as Record<string, unknown>).RED as any;
        const node = r?.nodes?.node(id);
        if (!node) return false;
        return r.nodes.getType(node.type) !== null;
      },
      nodeId,
      { timeout: 15_000 },
    );
    await this.page.evaluate((id) => {
      const r = (globalThis as Record<string, unknown>).RED as any;
      r.editor.edit(r.nodes.node(id));
    }, nodeId);
    await this.page.waitForSelector(".red-ui-tray", { timeout: 10_000 });
    await this.page.waitForTimeout(500);
  }

  async clickDone(): Promise<void> {
    await this.#closeTray("node-dialog-ok");
  }

  async clickCancel(): Promise<void> {
    await this.#closeTray("node-dialog-cancel");
  }

  // Waits for the tray COUNT to drop rather than for all trays to be hidden,
  // so a leftover tray from an earlier (failed) test can't poison the wait.
  async #closeTray(buttonId: string): Promise<void> {
    const before = await this.page.locator(".red-ui-tray").count();
    await this.page.evaluate((id) => {
      (globalThis as any).document.getElementById(id)!.click();
    }, buttonId);
    await this.page.waitForFunction(
      (count) => document.querySelectorAll(".red-ui-tray").length < count,
      before,
      { timeout: 5_000 },
    );
  }

  /**
   * Best-effort close of every open tray — call from afterEach so a failed
   * test never leaves a tray open for the next one.
   */
  async closeAllTrays(): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await this.page.locator(".red-ui-tray").count();
      if (count === 0) return;
      const cancel = this.page
        .locator("#node-config-dialog-cancel, #node-dialog-cancel")
        .last();
      if ((await cancel.count()) > 0) {
        await cancel.click({ force: true }).catch(() => {});
      } else {
        await this.page.keyboard.press("Escape");
      }
      // Wait for the tray count to actually drop instead of a fixed sleep — fast
      // when it closes; best-effort (.catch) so a lingering tray just retries the
      // loop. (edit/config-open keep their short settle after the real
      // waitForSelector: a "form ready" signal would hang for a consumer node
      // that has no typedInput/ACE widget.)
      await this.page
        .waitForFunction(
          (c) => document.querySelectorAll(".red-ui-tray").length < c,
          count,
          { timeout: 2_000 },
        )
        .catch(() => {});
    }
  }

  /**
   * Closes the config-node tray (stacked above the node tray) with its own
   * Done button. The node tray underneath stays open — use clickDone() for it.
   */
  async clickConfigDone(): Promise<void> {
    await this.page.click("#node-config-dialog-ok");
    await this.page
      .locator("#node-config-dialog-ok")
      .waitFor({ state: "hidden", timeout: 5_000 });
    await this.page.waitForTimeout(300);
  }

  async clickConfigCancel(): Promise<void> {
    await this.page.click("#node-config-dialog-cancel");
    await this.page
      .locator("#node-config-dialog-cancel")
      .waitFor({ state: "hidden", timeout: 5_000 });
    await this.page.waitForTimeout(300);
  }

  field(label: string): NodeRedField {
    return new NodeRedField(this.page, label);
  }

  /**
   * Clicks a Lifecycle Output Ports table toggle (Error/Complete/Status) by its
   * accessible name. These toggles live in a table cell, not a `.form-row`, so
   * they're located by the toggle input's aria-label rather than via field().
   */
  async toggleLifecyclePort(ariaLabel: string): Promise<void> {
    const slider = this.page
      .locator(".red-ui-tray")
      .last()
      .locator(
        `.nrg-lifecycle label.nrg-toggle:has(input[aria-label="${ariaLabel}"]) .nrg-toggle__slider`,
      );
    await slider.scrollIntoViewIfNeeded();
    await slider.click();
  }

  /**
   * Returns a JSON-safe snapshot of a node in the editor's model — use it to
   * assert values persisted after clickDone(). Functions, internals
   * (underscore-prefixed keys like `_def`), config `users` back-references,
   * and any circular references are stripped.
   */
  async getNode(nodeId: string): Promise<Record<string, any> | null> {
    return this.page.evaluate((id) => {
      const r = (globalThis as Record<string, unknown>).RED as any;
      const node = r?.nodes?.node(id);
      if (!node) return null;
      const seen = new WeakSet();
      return JSON.parse(
        JSON.stringify(node, (key, value) => {
          if (typeof value === "function") return undefined;
          if (key.startsWith("_") || key === "users") return undefined;
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return undefined;
            seen.add(value);
          }
          return value;
        }),
      );
    }, nodeId);
  }

  /**
   * Clicks the editor's Deploy button and waits until the workspace is clean.
   * Flows with invalid or unused nodes trigger a confirmation dialog — it is
   * confirmed automatically.
   */
  async clickDeploy(): Promise<void> {
    await this.page.click("#red-ui-header-button-deploy");
    // invalid/unused nodes raise a confirmation notification
    const confirm = this.page
      .locator(".red-ui-notification button.primary")
      .first();
    const confirmationShown = await confirm
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (confirmationShown) await confirm.click();
    await this.page.waitForFunction(
      () => {
        const r = (globalThis as Record<string, unknown>).RED as any;
        return r?.nodes?.dirty?.() === false;
      },
      { timeout: 15_000 },
    );
  }

  /** Fetches the currently deployed flow from the runtime (GET /flows). */
  async getDeployedFlow(): Promise<Record<string, unknown>[]> {
    const res = await fetch(`http://localhost:${this.port}/flows`);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch flows: ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<Record<string, unknown>[]>;
  }

  /** Counts the output ports rendered for a node on the canvas. */
  async getNodePortCount(nodeId: string): Promise<number> {
    const group = await this.#nodeGroup(nodeId);
    return group.locator(".red-ui-flow-port-output").count();
  }

  /** Returns the node's label text as rendered on the canvas. */
  async getNodeLabel(nodeId: string): Promise<string> {
    const group = await this.#nodeGroup(nodeId);
    const label = group.locator(".red-ui-flow-node-label").first();
    return ((await label.textContent()) ?? "").trim();
  }

  /** Returns the status text rendered under a node, or "" when none is set. */
  async getNodeStatus(nodeId: string): Promise<string> {
    const group = await this.#nodeGroup(nodeId);
    const status = group.locator(".red-ui-flow-node-status-label").first();
    if ((await status.count()) === 0) return "";
    return ((await status.textContent()) ?? "").trim();
  }

  async #nodeGroup(nodeId: string): Promise<Locator> {
    await this.page.waitForFunction(
      (id) => {
        const groups = Array.from(
          document.querySelectorAll(".red-ui-flow-node-group"),
        );
        return groups.some((el) => (el as any).__data__?.id === id);
      },
      nodeId,
      { timeout: 10_000 },
    );
    const index = await this.page.evaluate((id) => {
      const groups = Array.from(
        document.querySelectorAll(".red-ui-flow-node-group"),
      );
      return groups.findIndex((el) => (el as any).__data__?.id === id);
    }, nodeId);
    return this.page.locator(".red-ui-flow-node-group").nth(index);
  }

  /**
   * Asserts no uncaught page errors occurred, then clears the collected list
   * so each test only fails for its own errors — call it from afterEach.
   */
  expectNoPageErrors(): void {
    const errors = this.errors.splice(0);
    if (errors.length > 0) {
      throw new Error(
        `Page errors detected:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
      );
    }
  }

  get tray(): Locator {
    return this.page.locator(".red-ui-tray-body-wrapper");
  }
}

export class NodeRedField {
  readonly row: Locator;

  constructor(
    private readonly page: Page,
    readonly label: string,
  ) {
    // Scope to the topmost tray so fields resolve correctly when a config
    // tray (or expanded editor) is stacked above the node tray.
    this.row = page
      .locator(".red-ui-tray")
      .last()
      .locator(`.form-row:has(:text("${label}"))`)
      .first();
  }
  get input(): Locator {
    return this.row.locator("input").first();
  }

  async fill(value: string): Promise<void> {
    await this.input.fill(value, { force: true });
  }

  async clear(): Promise<void> {
    await this.input.fill("", { force: true });
  }

  async getValue(): Promise<string> {
    return this.input.inputValue();
  }

  async getInputType(): Promise<string | null> {
    return this.input.getAttribute("type");
  }
  get toggleSlider(): Locator {
    return this.row.locator(".nrg-toggle__slider");
  }

  async toggle(): Promise<void> {
    await this.toggleSlider.scrollIntoViewIfNeeded();
    await this.toggleSlider.click();
  }

  get checkbox(): Locator {
    return this.row.locator('input[type="checkbox"]');
  }
  get typedInputContainer(): Locator {
    return this.row.locator(".red-ui-typedInput-container");
  }

  async getSelectedType(): Promise<string> {
    return this.typedInputContainer
      .locator("input")
      .first()
      .evaluate((el) => (globalThis as any).$(el).typedInput("type") as string);
  }

  async getSelectedValue(): Promise<string> {
    return this.typedInputContainer
      .locator("input")
      .first()
      .evaluate(
        (el) => (globalThis as any).$(el).typedInput("value") as string,
      );
  }

  async openTypeMenu(): Promise<Locator> {
    await this.typedInputContainer
      .locator(".red-ui-typedInput-type-select")
      .click();
    const menu = this.page
      .locator(".red-ui-typedInput-options:visible")
      .first();
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    return menu;
  }

  async getTypeMenuValues(): Promise<string[]> {
    const menu = await this.openTypeMenu();
    const values = await menu
      .locator("a")
      .evaluateAll((els) => els.map((el) => el.getAttribute("value") ?? ""));
    await this.page.keyboard.press("Escape");
    return values;
  }

  async selectType(type: string): Promise<void> {
    const menu = await this.openTypeMenu();
    await menu.locator(`a[value="${type}"]`).click();
  }

  async openOptionMenu(): Promise<Locator> {
    await this.typedInputContainer
      .locator(".red-ui-typedInput-option-trigger")
      .click();
    const menu = this.page
      .locator(".red-ui-typedInput-options:visible")
      .first();
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    return menu;
  }

  async getOptionMenuLabels(): Promise<string[]> {
    const menu = await this.openOptionMenu();
    const labels = await menu
      .locator("a")
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
    await this.page.keyboard.press("Escape");
    return labels;
  }
  get select(): Locator {
    return this.row.locator("select");
  }

  get editButton(): Locator {
    return this.row.locator("a.red-ui-button:has(i.fa-pencil)");
  }

  get addButton(): Locator {
    return this.row.locator("a.red-ui-button:has(i.fa-plus)");
  }

  /** Clicks the + button of a config field and waits for the config tray. */
  async openAddConfig(): Promise<void> {
    await this.addButton.click();
    await this.page
      .locator("#node-config-dialog-ok")
      .waitFor({ state: "visible", timeout: 10_000 });
    await this.page.waitForTimeout(500);
  }

  /** Clicks the pencil button of a config field and waits for the config tray. */
  async openEditConfig(): Promise<void> {
    await this.editButton.click();
    await this.page
      .locator("#node-config-dialog-ok")
      .waitFor({ state: "visible", timeout: 10_000 });
    await this.page.waitForTimeout(500);
  }

  async getSelectedOption(): Promise<string> {
    return this.select.inputValue();
  }

  async getSelectedOptionLabel(): Promise<string> {
    const value = await this.getSelectedOption();
    return this.select
      .locator(`option[value="${value}"]`)
      .textContent()
      .then((t) => t?.trim() ?? "");
  }

  async getOptions(): Promise<string[]> {
    return this.select
      .locator("option")
      .evaluateAll((els) =>
        els
          .map((el) => el.textContent?.trim() ?? "")
          .filter((t) => !t.startsWith("Add new ") && t !== ""),
      );
  }
  get editorWrapper(): Locator {
    return this.row.locator(".editor-wrapper");
  }

  /** Reads the value of the field's code editor (Monaco, ACE fallback). */
  async getEditorValue(): Promise<string> {
    return this.editorWrapper.evaluate((el) => {
      const w = globalThis as any;
      const editors = w.monaco?.editor?.getEditors?.() ?? [];
      const monacoEditor = editors.find((e: any) =>
        el.contains(e.getContainerDomNode()),
      );
      if (monacoEditor) return monacoEditor.getValue() as string;
      const aceEl = el.querySelector(".ace_editor");
      if (aceEl && w.ace) return w.ace.edit(aceEl).getValue() as string;
      throw new Error("No code editor instance found in this field");
    });
  }

  /** Sets the value of the field's code editor (Monaco, ACE fallback). */
  async setEditorValue(value: string): Promise<void> {
    await this.editorWrapper.evaluate((el, newValue) => {
      const w = globalThis as any;
      const editors = w.monaco?.editor?.getEditors?.() ?? [];
      const monacoEditor = editors.find((e: any) =>
        el.contains(e.getContainerDomNode()),
      );
      if (monacoEditor) {
        monacoEditor.setValue(newValue);
        return;
      }
      const aceEl = el.querySelector(".ace_editor");
      if (aceEl && w.ace) {
        w.ace.edit(aceEl).setValue(newValue, 1);
        return;
      }
      throw new Error("No code editor instance found in this field");
    }, value);
  }

  /**
   * Types into the field and returns the labels of the autocomplete
   * suggestions that appear (TypedInput types with an `autoComplete` source).
   */
  async getAutoCompleteSuggestions(prefix: string): Promise<string[]> {
    // the typedInput widget hides the original input and renders its own
    const input = this.row.locator("input:visible").first();
    await input.fill("", { force: true });
    await input.pressSequentially(prefix, { delay: 30 });
    const menu = this.page
      .locator(".red-ui-autoComplete-container:visible")
      .first();
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    const labels = await menu
      .locator("li")
      .evaluateAll((els) =>
        els.map((el) => el.textContent?.trim() ?? "").filter(Boolean),
      );
    await this.page.keyboard.press("Escape");
    return labels;
  }

  get expandButton(): Locator {
    return this.row.locator(".expand-button");
  }
  get textarea(): Locator {
    return this.row.locator("textarea");
  }
  get requiredIndicator(): Locator {
    return this.row.locator(".nrg-required");
  }

  get errorMessage(): Locator {
    return this.row.locator(".node-red-vue-input-error-message");
  }

  async expectError(containing?: string): Promise<void> {
    if (containing) {
      await this.errorMessage
        .filter({ hasText: containing })
        .waitFor({ state: "visible", timeout: 5_000 });
    } else {
      await this.errorMessage.waitFor({ state: "visible", timeout: 5_000 });
    }
  }

  async expectNoError(): Promise<void> {
    await this.errorMessage.waitFor({ state: "hidden", timeout: 5_000 });
  }
  async scrollIntoView(): Promise<void> {
    await this.row.scrollIntoViewIfNeeded();
  }

  async expectVisible(): Promise<void> {
    await this.row.waitFor({ state: "visible", timeout: 5_000 });
  }

  async expectHidden(): Promise<void> {
    await this.row.waitFor({ state: "hidden", timeout: 5_000 });
  }
}
