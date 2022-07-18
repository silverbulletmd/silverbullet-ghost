import { readSettings } from "@silverbulletmd/plugs/lib/settings_page";
import { readSecrets } from "@silverbulletmd/plugs/lib/secrets_page";
import { invokeFunction } from "@silverbulletmd/plugos-silverbullet-syscall/system";
import {
  flashNotification,
  getCurrentPage,
  getText,
} from "@silverbulletmd/plugos-silverbullet-syscall/editor";
import { cleanMarkdown } from "@silverbulletmd/plugs/markdown/util";
import { GhostAdmin } from "./ghost_api";

type GhostConfig = {
  url: string;
  adminKey: string;
  postPrefix: string;
  pagePrefix: string;
};

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

function mobileDocToMarkdown(doc: string): string | null {
  let mobileDoc = JSON.parse(doc) as MobileDoc;
  if (mobileDoc.cards.length > 0 && mobileDoc.cards[0][0] === "markdown") {
    return mobileDoc.cards[0][1].markdown;
  }
  return null;
}

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

const postRegex = /#\s*([^\n]+)\n([^$]+)$/;

async function markdownToPost(text: string): Promise<Partial<Post>> {
  let match = postRegex.exec(text);
  if (match) {
    let [, title, content] = match;
    return {
      title,
      mobiledoc: markdownToMobileDoc(await cleanMarkdown(content)),
    };
  }
  throw Error("Post should stat with a # header");
}

async function getConfig(): Promise<GhostConfig> {
  let {
    ghostUrl: url,
    ghostPostPrefix: postPrefix,
    ghostPagePrefix: pagePrefix,
  } = await readSettings({
    ghostUrl: "",
    ghostPostPrefix: "ghost/post",
    ghostPagePrefix: "ghost/page",
  });
  let [adminKey] = await readSecrets(["ghostAdminKey"]);
  return {
    url,
    pagePrefix,
    postPrefix,
    adminKey,
  };
}

export async function publishCommand() {
  let config = await getConfig();
  let pageName = await getCurrentPage();
  if(pageName.startsWith(config.pagePrefix)) {
    await flashNotification("Publishing page to Ghost...");
  } else if(pageName.startsWith(config.postPrefix)) {
    await flashNotification("Publishing post to Ghost...");
  } else {
    await flashNotification("Page is not in either the page or post prefix", "error");
    return;
  }
  if(await invokeFunction(
    "server",
    "publish",
    pageName,
    await getText()
  )) {
    await flashNotification("Publish successful!");
  } else {
    await flashNotification("Publish failed!");
  }
}

export async function publish(name: string, text: string): Promise<boolean> {
  let config = await getConfig();
  let admin = new GhostAdmin(config.url, config.adminKey);
  await admin.init();
  let post = await markdownToPost(text);
  if (name.startsWith(config.postPrefix)) {
    post.slug = name.substring(config.postPrefix.length + 1);
    await admin.publishPost(post);
    return true;
  } else if (name.startsWith(config.pagePrefix)) {
    post.slug = name.substring(config.pagePrefix.length + 1);
    await admin.publishPage(post);
    return true;
  }
  return false;
}
