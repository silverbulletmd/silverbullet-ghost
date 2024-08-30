import "$sb/lib/native_fetch.ts";
import { mime } from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";
import type { Post } from "./ghost.ts";

import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

export type Image = {
  ref: string;
  url: string;
};

const fromHexString = (hexString: string) =>
  Uint8Array.from(
    hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );
export class GhostAdmin {
  private token?: string;

  constructor(private url: string, private key: string) {}

  async init() {
    const [id, secret] = this.key.split(":");

    const key = await crypto.subtle.importKey(
      "raw",
      fromHexString(
        secret,
      ),
      { name: "HMAC", hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );

    this.token = await create({
      alg: "HS256",
      kid: id,
      typ: "JWT",
    }, {
      exp: getNumericDate(5 * 60),
      iat: getNumericDate(0),
      aud: "/v3/admin/",
    }, key);
  }

  async listPosts(): Promise<Post[]> {
    const result = await nativeFetch(
      `${this.url}/ghost/api/v3/admin/posts?include=lexical&order=published_at+DESC`,
      {
        headers: {
          Authorization: `Ghost ${this.token}`,
        },
      },
    );

    return (await result.json()).posts;
  }

  async uploadImage(filename: string, data: Uint8Array): Promise<any> {
    const contentType = mime.getType(filename);
    const blob = new Blob([data], { type: contentType });

    // Create FormData and append the Blob
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("ref", filename);

    // Use fetch to send the request
    const result = await nativeFetch(
      `${this.url}/ghost/api/v3/admin/images/upload`,
      {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Ghost ${this.token}`,
        },
      },
    );

    return result.json();
  }

  publishPost(post: Partial<Post>): Promise<any> {
    return this.publish("posts", post);
  }

  publishPage(post: Partial<Post>): Promise<any> {
    return this.publish("pages", post);
  }

  async publish(what: "pages" | "posts", post: Partial<Post>): Promise<any> {
    const oldPostQueryR = await fetch(
      `${this.url}/ghost/api/v3/admin/${what}/slug/${post.slug}`,
      {
        headers: {
          Authorization: `Ghost ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );
    let oldPostQuery = await oldPostQueryR.json();
    if (!oldPostQuery[what]) {
      // New!
      if (!post.status) {
        post.status = "draft";
      }
      let result = await fetch(`${this.url}/ghost/api/v3/admin/${what}`, {
        method: "POST",
        headers: {
          Authorization: `Ghost ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [what]: [post],
        }),
      });
      return (await result.json())[what][0];
    } else {
      let oldPost: Post = oldPostQuery[what][0];
      post.updated_at = oldPost.updated_at;
      let result = await fetch(
        `${this.url}/ghost/api/v3/admin/${what}/${oldPost.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Ghost ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            [what]: [post],
          }),
        },
      );
      return (await result.json())[what][0];
    }
  }
}
