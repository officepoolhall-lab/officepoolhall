import { describe, expect, it } from "vitest";
import { parseRss } from "./rss";

// Trimmed from the real CBS Sports and Yahoo Sports college football feeds (Oct 2026).
const CBS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<title>CBS Sports Headlines</title>
<image><url>https://sports.cbsimg.net/fly/images/cbssports/logo-digital.png</url></image>
<item>
  <title>Big 12 rules Notre Dame should have been allowed another play</title>
  <link>https://www.cbssports.com/college-football/news/notre-dame-byu-officials-mistake-error-big-12/</link>
  <description>The clock still had :01 remaining when officials erroneously ruled the Cougars-Irish game was over</description>
  <pubDate>Sun, 18 Oct 2026 06:57:17 +0000</pubDate>
  <guid isPermaLink="false">dd29dff0-1cf8-44c6-98f1-f61116a37f10</guid>
  <dc:creator>Richard Johnson</dc:creator>
  <enclosure url="https://sportshub.cbsistatic.com/i/r/2026/10/18/a.jpg" length="2448632" type="image/jpeg"/>
</item>
</channel></rss>`;

const YAHOO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title></title>
<item>
  <guid isPermalink="false">918ec3ea-26c4-3ff0-b738-fa86903345ca</guid>
  <title>Arizona football down 4 offensive starters for trip to West Virginia</title>
  <link>https://sports.yahoo.com/articles/arizona-football-down-4-offensive-030543202.html</link>
  <description><![CDATA[<p>Arizona managed to overcome the loss of all three starting wide receivers &amp; more […]</p>]]></description>
  <content:encoded><![CDATA[<p><img alt="" src="https://s.yimg.com/ny/api/res/1.2/x.jpg" data-uuid="1"/></p><p>Body</p>]]></content:encoded>
  <source>SB Nation</source>
  <pubDate>Thu, 08 Oct 2026 03:05:43 +0000</pubDate>
</item>
<item><title>No link here</title></item>
</channel></rss>`;

describe("parseRss", () => {
  it("reads a CBS item with an image enclosure", () => {
    const [item] = parseRss(CBS);
    expect(item.title).toBe("Big 12 rules Notre Dame should have been allowed another play");
    expect(item.link).toBe("https://www.cbssports.com/college-football/news/notre-dame-byu-officials-mistake-error-big-12/");
    expect(item.published).toBe("2026-10-18T06:57:17.000Z");
    expect(item.image).toBe("https://sportshub.cbsistatic.com/i/r/2026/10/18/a.jpg");
    expect(item.guid).toBe("dd29dff0-1cf8-44c6-98f1-f61116a37f10");
  });

  it("reads a Yahoo item: CDATA HTML description, image from the body, skips items without a link", () => {
    const items = parseRss(YAHOO);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Arizona managed to overcome the loss of all three starting wide receivers & more […]");
    expect(items[0].image).toBe("https://s.yimg.com/ny/api/res/1.2/x.jpg");
  });

  it("decodes &amp; in an image URL taken from the body", () => {
    const xml = `<rss><channel><item><title>T</title><link>https://example.com/a</link>
      <content:encoded><![CDATA[<img src="https://s.yimg.com/ny/api/res/1.2/a?w=960&amp;h=540"/>]]></content:encoded></item></channel></rss>`;
    expect(parseRss(xml)[0].image).toBe("https://s.yimg.com/ny/api/res/1.2/a?w=960&h=540");
  });

  it("reads a Fox Sports item: image from media:content, not its nested thumbnail", () => {
    const xml = `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
      <title>AP Top 25: Miami Claims No. 1</title>
      <link>https://www.foxsports.com/stories/college-football/ap-top-25</link>
      <pubDate>Sun, 18 Oct 2026 15:01:51 -0400</pubDate>
      <media:content url="https://a57.foxsports.com/full.jpg" width="1280" height="720">
        <media:thumbnail url="https://a57.foxsports.com/thumb.jpg" width="128" height="72"/>
      </media:content>
    </item></channel></rss>`;
    const [item] = parseRss(xml);
    expect(item.image).toBe("https://a57.foxsports.com/full.jpg");
    expect(item.published).toBe("2026-10-18T19:01:51.000Z");
  });

  it("reads an NBC Sports item: the image media:content, not the video one listed first", () => {
    const xml = `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
      <title>Kansas lands Purdue transfer</title>
      <link>https://www.nbcsports.com/mens-college-basketball/news/kansas-lands-purdue-transfer</link>
      <pubDate>Mon, 19 Oct 2026 12:28:17 -0400</pubDate>
      <media:content url="https://cdn.jwplayer.com/players/abc.html" type="video/mp4" width="1920" height="1080">
        <media:thumbnail url="https://cdn.jwplayer.com/thumb.jpg"/>
      </media:content>
      <media:content url="https://nbcsports.brightspotcdn.com/photo.jpg" type="image/jpeg"><media:credit>AP</media:credit></media:content>
    </item></channel></rss>`;
    const [item] = parseRss(xml);
    expect(item.image).toBe("https://nbcsports.brightspotcdn.com/photo.jpg");
    expect(item.published).toBe("2026-10-19T16:28:17.000Z");
  });

  it("decodes entities in titles", () => {
    const xml = `<rss><channel><item><title>Texas A&amp;M&#39;s &quot;big&quot; win</title><link>https://example.com/a</link></item></channel></rss>`;
    expect(parseRss(xml)[0].title).toBe(`Texas A&M's "big" win`);
  });
});
