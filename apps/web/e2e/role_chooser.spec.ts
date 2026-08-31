import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The role chooser on the story surface.
 *
 * Nothing asserted this until Sprint 9. When it was reported as "the selected
 * button doesn't display the text that is selected", there was no test that
 * could say whether it did -- and reading the CSS could not settle it either,
 * because the rule that decides it (`.role-tab[data-on="true"]`) collides on
 * specificity with `.role-tab:hover` and only source order separates them.
 *
 * A question about a rendered state is answered by rendering it. These
 * assertions measure contrast rather than compare hex values, so a palette
 * change is free and an ILLEGIBLE palette change is not.
 */

const MIN_CONTRAST = 4.5;

/**
 * Resolve a computed colour to sRGB 0-255 IN THE PAGE, rather than parsing the
 * string here.
 *
 * The first version of this file parsed `rgb(r, g, b)` with a regex. That is
 * fine until a value comes back as `color(srgb 0.845 0.845 0.852)` -- which is
 * what `color-mix()` computes to -- and the regex reads 0.845 as an 0-255
 * channel, producing near-black. It reported a contrast of 1.005 against a
 * pill that is plainly legible, and the finding was in the test.
 *
 * Canvas does the conversion the browser already knows how to do, so any
 * colour syntax the CSS may use in future resolves correctly.
 */
async function toRgb(page: Page, css: string): Promise<[number, number, number]> {
  return page.evaluate((value) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, css);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

async function contrast(page: Page, fg: string, bg: string): Promise<number> {
  const a = relativeLuminance(await toRgb(page, fg));
  const b = relativeLuminance(await toRgb(page, bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const paint = (tab: Locator) =>
  tab.evaluate((n) => {
    const c = getComputedStyle(n);
    return { on: n.getAttribute("data-on"), aria: n.getAttribute("aria-selected"), color: c.color, bg: c.backgroundColor };
  });

test.describe("the role chooser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/story");
    await page.locator(".role-tab").first().waitFor();
  });

  test("the server-rendered selection is legible before any interaction", async ({ page }) => {
    const selected = page.locator('.role-tab[data-on="true"]');
    await expect(selected).toHaveCount(1);
    const style = await paint(selected);
    expect(style.aria, "aria-selected must track the visual state").toBe("true");
    expect(
      await contrast(page, style.color, style.bg),
      `selected tab reads ${style.color} on ${style.bg}`,
    ).toBeGreaterThan(MIN_CONTRAST);
  });

  /**
   * The reported symptom. It did not reproduce, but "we looked once" is not a
   * guard -- this is the assertion that would have answered it in seconds.
   */
  test("a tab selected by clicking is styled as selected, not just marked", async ({ page }) => {
    const target = page.locator(".role-tab", { hasText: "DevOps / SRE" }).first();
    const previous = page.locator('.role-tab[data-on="true"]');
    const previousText = await previous.textContent();

    await target.click();
    await expect(target).toHaveAttribute("data-on", "true");

    const after = await paint(target);
    expect(after.aria).toBe("true");
    expect(
      await contrast(page, after.color, after.bg),
      "a tab selected by clicking must look selected, not merely carry the attribute",
    ).toBeGreaterThan(MIN_CONTRAST);

    // and it must look DIFFERENT from an unselected one, or "selected" is a
    // state only the DOM knows about
    const other = page.locator(".role-tab", { hasText: "Product Manager" }).first();
    const unselected = await paint(other);
    expect(after.bg, "selected and unselected tabs render identically").not.toBe(unselected.bg);

    // exactly one at a time, and the old one actually let go
    await expect(page.locator('.role-tab[data-on="true"]')).toHaveCount(1);
    const old = page.locator(".role-tab", { hasText: previousText ?? "" }).first();
    await expect(old).toHaveAttribute("data-on", "false");
  });

  /**
   * The defect that was actually reported: the label vanishes DURING the
   * selection change, not after it.
   *
   * `transition: color, background` interpolates the two independently, and
   * the path from unselected (#a1a1a8 on #0b0b0d) to selected (#000 on
   * #f5f5f7) runs the text toward black while the background is still
   * near-black. Measured through the fade the contrast went
   * 7.66 -> 5.39 -> 1.71 -> 8.62 -> 19.29: a ~60ms window where the text of
   * the tab you just clicked is not readable.
   *
   * Sampling only the settled state says this surface is fine. It is fine
   * afterwards. The complaint was about the moment in between, so that is
   * the moment this samples.
   */
  test("the label stays readable THROUGH the selection change", async ({ page }) => {
    const target = page.locator(".role-tab", { hasText: "DevOps / SRE" }).first();
    await target.click();

    const readings: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const { color, bg } = await paint(target);
      readings.push(await contrast(page, color, bg));
      await page.waitForTimeout(30);
    }

    const worst = Math.min(...readings);
    expect(
      worst,
      `contrast dipped to ${worst.toFixed(2)} mid-change (readings: ` +
        `${readings.map((r) => r.toFixed(2)).join(", ")}). A selection is a discrete ` +
        `state change; it must not cross-fade through an illegible midpoint.`,
    ).toBeGreaterThan(MIN_CONTRAST);
  });

  test("hovering the selected tab does something", async ({ page }) => {
    const selected = page.locator('.role-tab[data-on="true"]');
    const resting = await paint(selected);
    await selected.hover();
    await page.waitForTimeout(350);
    const hovered = await paint(selected);

    // `.role-tab:hover` and `.role-tab[data-on="true"]` have identical
    // specificity, so the selected rule took back both colour and background
    // and hovering the chosen tab changed nothing at all.
    expect(
      hovered.bg !== resting.bg || hovered.color !== resting.color,
      "the selected tab gives no hover feedback; it is a control that looks inert",
    ).toBe(true);
    expect(
      await contrast(page, hovered.color, hovered.bg),
      "hover must not cost legibility",
    ).toBeGreaterThan(MIN_CONTRAST);
  });

  test("selection is not carried by colour alone", async ({ page }) => {
    // Every declaration distinguishing a selected tab was a colour, and a
    // forced-colors mode overrides all of them -- in Windows High Contrast the
    // chosen role was indistinguishable from the other ten.
    const hasForcedColors = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSMediaRule && rule.conditionText.includes("forced-colors")) {
              return Array.from(rule.cssRules).some(
                (r) => r instanceof CSSStyleRule && r.selectorText.includes("role-tab"),
              );
            }
          }
        } catch {
          /* cross-origin sheet */
        }
      }
      return false;
    });
    expect(hasForcedColors, "no forced-colors rule covers the role tabs").toBe(true);
  });

  test("the pill keeps its shape under keyboard focus", async ({ page }) => {
    // The global :focus-visible sets border-radius 4px, which beat the pill's
    // 999px and squared the control off for keyboard users only.
    const tab = page.locator(".role-tab").first();
    await tab.focus();
    const radius = await tab.evaluate((n) => getComputedStyle(n).borderRadius);
    expect(Number.parseFloat(radius)).toBeGreaterThan(100);
  });
});
