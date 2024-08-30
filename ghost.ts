import { readSecret } from "$sb/lib/secrets_page.ts";
import {
  editor,
  markdown,
  space,
  system,
} from "@silverbulletmd/silverbullet/syscalls";
import { cleanMarkdown } from "$sb-plugs/markdown/util.ts";
import { GhostAdmin } from "./ghost_api.ts";
import type { PublishEvent } from "@silverbulletmd/silverbullet/types";
import {
  extractFrontmatter,
  prepareFrontmatterDispatch,
} from "@silverbulletmd/silverbullet/lib/frontmatter";
import { ParseTree } from "@silverbulletmd/silverbullet/lib/tree";

type GhostInstanceConfig = {
  url: string;
  adminKey: string;
};

type GhostConfig = Record<string, GhostInstanceConfig>;

export type Post = {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  lexical: string;
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

function markdownToLexical(text: string): string {
  return JSON.stringify({
    "root": {
      "children": [{
        "type": "markdown",
        "version": 1,
        "markdown": text,
      }, {
        "children": [],
        "direction": null,
        "format": "",
        "indent": 0,
        "type": "paragraph",
        "version": 1,
      }],
      "direction": null,
      "format": "",
      "indent": 0,
      "type": "root",
      "version": 1,
    },
  });
}

const postRegex = /#\s*([^\n]+)\n(([^\n]|\n)+)$/;

async function markdownToPost(text: string): Promise<Partial<Post>> {
  const match = postRegex.exec(text);
  if (match) {
    const [, title, content] = match;
    return {
      title,
      lexical: markdownToLexical(await cleanMarkdown(content)),
    };
  }
  throw Error("Post should stat with a # header");
}

async function getConfig(): Promise<GhostConfig> {
  const config = await system.getSpaceConfig("ghost") as GhostConfig;
  const secret = await readSecret("ghost") as Record<string, string>; // instance to admin key
  // Slot in secrets with the configs
  for (const [name, def] of Object.entries(config)) {
    def.adminKey = secret[name];
  }
  return config;
}

export async function publish(event: PublishEvent): Promise<boolean> {
  const config = await getConfig();
  const [, name, type, slug] = event.uri!.split(":");
  const instanceConfig = config[name];
  if (!instanceConfig) {
    throw new Error("No config for instance " + name);
  }
  const admin = new GhostAdmin(instanceConfig.url, instanceConfig.adminKey);
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

async function selectInstance(): Promise<string | undefined> {
  const config = await getConfig();
  const choices = Object.keys(config);
  const choice = await editor.filterBox(
    "Select Ghost instance",
    choices.map((c) => ({ name: c })),
  );
  if (!choice) {
    return;
  }
  return choice.name;
}

async function selectPublishType(): Promise<"post" | "page" | undefined> {
  const choice = await editor.filterBox("Select publish type", [
    { name: "post" },
    { name: "page" },
  ]);
  if (!choice) {
    return;
  }
  return choice.name as "post" | "page";
}

export async function publishPage() {
  const currentPage = await editor.getCurrentPage();
  const text = await editor.getText();
  const tree = await markdown.parseMarkdown(text);

  const { $share } = await extractFrontmatter(tree);

  if ($share && Array.isArray($share)) {
    for (const share of $share) {
      if (share.startsWith("ghost:")) {
        // We got a ghost share, let's publish it and we're done
        await publish({
          name: currentPage,
          uri: share,
        });
        return editor.flashNotification("Published to Ghost!");
      }
    }
  }

  // If we're here, this page has not been shared to Ghost yet

  // Let's select an instance
  const instanceName = await selectInstance();
  if (!instanceName) {
    return;
  }

  // And a type (post or page)
  const type = await selectPublishType();
  if (!type) {
    return;
  }
  const config = await getConfig();
  const instanceConfig = config[instanceName];
  if (!instanceConfig) {
    throw new Error("No config for instance " + instanceName);
  }

  // And a post/page slug
  const slug = await editor.prompt("Post slug");
  if (!slug) {
    return;
  }
  const post = await markdownToPost(text);
  post.slug = slug;

  // Publish to Ghost
  const admin = new GhostAdmin(instanceConfig.url, instanceConfig.adminKey);
  await admin.init();
  await admin.publishPost(post);

  // Update frontmatter
  await editor.dispatch(
    await prepareFrontmatterDispatch(tree, {
      $share: [`ghost:${instanceName}:${type}:${slug}`],
    }),
  );

  await editor.flashNotification("Published to Ghost!");
}

export async function uploadImagesAndReplaceLinks(
  tree: ParseTree,
  instanceConfig: GhostInstanceConfig,
) {
  const admin = new GhostAdmin(instanceConfig.url, instanceConfig.adminKey);
  await admin.init();
  const image = await space.readAttachment("zefplus/posts/test.png");
  console.log("Got image", image.byteLength);
  console.log(await admin.uploadImage("test.png", image));
}
