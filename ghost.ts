import { readSetting } from "$sb/lib/settings_page.ts";
import { readSecret } from "$sb/lib/secrets_page.ts";
import { space } from "$sb/silverbullet-syscall/mod.ts";
import { cleanMarkdown } from "$sb-plugs/markdown/util.ts";
import { GhostAdmin } from "./ghost_api.ts";
import type { PublishEvent } from "$sb/app_event.ts";

type GhostConfig = Record<string, {
  url: string;
  adminKey: string;
  postPrefix: string;
  pagePrefix: string;
}>;

export type Post = {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  mobiledoc: string;
  status: "draft" | "published";
  visibility: string;
  created_at: string;
  upblished_at: string;
  updated_at: string;
  tags: Tag[];
  primary_tag: Tag;
  url: string;
  excerpt: string;
};

type Tag = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type MobileDoc = {
  version: string;
  atoms: any[];
  cards: Card[];
};

type Card = any[];

// function mobileDocToMarkdown(doc: string): string | null {
//   let mobileDoc = JSON.parse(doc) as MobileDoc;
//   if (mobileDoc.cards.length > 0 && mobileDoc.cards[0][0] === "markdown") {
//     return mobileDoc.cards[0][1].markdown;
//   }
//   return null;
// }

function markdownToMobileDoc(text: string): string {
  return JSON.stringify({
    version: "0.3.1",
    atoms: [],
    cards: [["markdown", { markdown: text }]],
    markups: [],
    sections: [
      [10, 0],
      [1, "p", []],
    ],
  });
}

const postRegex = /#\s*([^\n]+)\n(([^\n]|\n)+)$/;

async function markdownToPost(text: string): Promise<Partial<Post>> {
  const match = postRegex.exec(text);
  if (match) {
    const [, title, content] = match;
    return {
      title,
      mobiledoc: markdownToMobileDoc(await cleanMarkdown(content)),
    };
  }
  throw Error("Post should stat with a # header");
}

async function getConfig(): Promise<GhostConfig> {
  const config = await readSetting("ghost") as GhostConfig;
  const secret = await readSecret("ghost") as Record<string, string>; // instance to admin key
  // Slot in secrets with the configs
  for (const [name, def] of Object.entries(config)) {
    def.adminKey = secret[name];
  }
  return config;
}

export async function publish(event: PublishEvent): Promise<boolean> {
  const config = await getConfig();
  const [, name, type, slug] = event.uri.split(":");
  const instanceConfig = config[name];
  if (!instanceConfig) {
    throw new Error("No config for instance " + name);
  }
  let admin = new GhostAdmin(instanceConfig.url, instanceConfig.adminKey);
  await admin.init();
  const text = await space.readPage(event.name);
  const post = await markdownToPost(text);
  post.slug = slug;
  if (type === "post") {
    await admin.publishPost(post);
  } else if (type === "page") {
    await admin.publishPage(post);
  }
  return true;
}
