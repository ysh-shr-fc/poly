import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseGlossary } from "../lib/glossary";

const callModel = vi.fn();
vi.mock("../lib/model", () => ({ callModel: (...args: unknown[]) => callModel(...args) }));

const { translateSegments } = await import("../lib/segments");

const rules = parseGlossary(`Rule,Target Language,Term,Revised by,Date,Match Level,Enforcement
Rain Bird,ar,Rain Bird,,,whole_word,exact
معدل التدفق,ar,flow rate,,,phrase,exact`);

function itemsIn(messages: Array<{ content: string }>): Array<{ id: number; text?: string; source?: string }> {
  const content = messages[1].content;
  return JSON.parse(content.slice(content.indexOf("[")));
}

describe("segment translation", () => {
  beforeEach(() => {
    callModel.mockReset();
  });

  it("protects preserved terms per segment and restores them", async () => {
    callModel.mockImplementation(async (messages) =>
      JSON.stringify(itemsIn(messages).map(({ id, text }) => ({ id, text: `عربي ${text!.match(/__RB_KEEP_\d+__/g)?.join(" ") ?? ""}`.trim() }))),
    );
    const { translations, matches } = await translateSegments(["Rain Bird rotors", "Rain Bird valves"], rules);
    expect(translations).toEqual(["عربي Rain Bird", "عربي Rain Bird"]);
    expect(matches).toHaveLength(2);
    const sent = itemsIn(callModel.mock.calls[0][0]).map((item) => item.text);
    expect(sent).toEqual(["__RB_KEEP_0001__ rotors", "__RB_KEEP_0002__ valves"]);
  });

  it("repairs only the failing segments", async () => {
    callModel
      .mockResolvedValueOnce(JSON.stringify([{ id: 1, text: "أ" }, { id: 2, text: "التدفق" }]))
      .mockImplementationOnce(async (messages) => {
        const items = itemsIn(messages);
        expect(items.map((item) => item.id)).toEqual([2]);
        return JSON.stringify([{ id: 2, text: "معدل التدفق" }]);
      });
    const { translations } = await translateSegments(["Hello", "The flow rate"], rules);
    expect(translations).toEqual(["أ", "معدل التدفق"]);
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("reports segments that still fail after repair", async () => {
    callModel.mockResolvedValue("not json");
    await expect(translateSegments(["Hello"], rules)).rejects.toThrow("Segment 1");
  });
});
