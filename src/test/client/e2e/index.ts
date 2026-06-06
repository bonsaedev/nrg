import fs from "fs";
import path from "path";
import type { Page, Locator } from "playwright";

export class NodeRedEditor {
  readonly errors: string[] = [];
  private screenshotDir: string;

  constructor(
    readonly page: Page,
    readonly port: number,
    options?: { screenshotDir?: string },
  ) {
    this.screenshotDir = options?.screenshotDir ?? "test-results/screenshots";
    page.on("pageerror", (err) => this.errors.push(err.message));
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
    await this.page.evaluate(() => {
      (globalThis as any).document.getElementById("node-dialog-ok")!.click();
    });
    await this.page.waitForSelector(".red-ui-tray", {
      state: "hidden",
      timeout: 5_000,
    });
  }

  async clickCancel(): Promise<void> {
    await this.page.evaluate(() => {
      (globalThis as any).document
        .getElementById("node-dialog-cancel")!
        .click();
    });
    await this.page.waitForSelector(".red-ui-tray", {
      state: "hidden",
      timeout: 5_000,
    });
  }

  field(label: string): NodeRedField {
    return new NodeRedField(this.page, label);
  }

  expectNoPageErrors(): void {
    if (this.errors.length > 0) {
      throw new Error(
        `Page errors detected:\n${this.errors.map((e) => `  - ${e}`).join("\n")}`,
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
    this.row = page.locator(`.form-row:has(:text("${label}"))`).first();
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
    const menu = this.page.locator(".red-ui-typedInput-options").last();
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
    const menu = this.page.locator(".red-ui-typedInput-options").last();
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
    await this.errorMessage.waitFor({ state: "visible", timeout: 5_000 });
    if (containing) {
      const text = await this.errorMessage.textContent();
      if (!text?.includes(containing)) {
        throw new Error(
          `Expected error containing "${containing}", got "${text}"`,
        );
      }
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
