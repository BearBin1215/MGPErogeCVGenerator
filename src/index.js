import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const baseUrl = "http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki"; // 批评空间链接，可自行改为其他镜像站
const createrID = 12475; // 批评空间声优页面id，在网址里面可以找到

// 网络代理
const proxy = {
    host: "127.0.0.1",
    port: 7890,
};

const maxRetry = 5;
const data = [];
const wikitextBase = {};
const sleep = (time = 1000) => new Promise((resolve) => setTimeout(resolve, time));


// 获取HTML文档
const erogameScapePage = await axios.get(`${baseUrl}/creater_allgame.php?creater=${createrID}`, { proxy });
const $ = cheerio.load(erogameScapePage.data);
const name = $("#creater_title").text().trim();

// 分析页面获取作品、出演角色等信息
$("#a_list_of_games_concerned_with_5").find("tr.odd").each((_, ele) => {
    const $ele = $(ele);
    const date = $ele.prev().children().eq(3).text().trim(); // 发售日期
    const work = $ele.prev().children().eq(1).children("a").text().trim(); // 作品名
    const href = $ele.prev().children().eq(1).children("a").attr("href").replace("#ad", ""); // 作品链接，用于在标题带有...时获取完整名字
    const version = $ele.prev().children().eq(1).children("span").text().trim().replace(/\(|\)/g, ""); // 平台
    const chara = $ele.text().trim(); // 角色名
    data.push({
        date,
        work,
        href,
        version,
        chara,
    });
});

// 进一步处理获取到的信息
for (const { href, date, work, chara, version } of data.reverse()) {
    wikitextBase[date.slice(0, 4)] ||= [];
    let title;

    // 末尾是...的作品需要获取完整标题
    if (work.slice(-3) === "...") {
        for (let retryCount = 0; retryCount < maxRetry; retryCount++) {
            try {
                const workPage = await axios.get(`${baseUrl}/${href}`, { proxy });
                const $work = cheerio.load(workPage.data);
                title = $work("#soft-title>.bold").text().trim();
                console.log(`获取到标题：${title}`);
                await sleep(5000);
                break;
            } catch (error) {
                console.error(`获取“${work}”完整名称错误：${error}（${retryCount}/${maxRetry}）`);
                await sleep(5000);
            }
        }
    } else {
        title = work;
    }
    // 根据标题判断萌百是否有对应页面用于生成内链
    try {
        const { data: { query: { pages } } } = await axios.get("https://mzh.moegirl.org.cn/api.php", {
            params: {
                format: "json",
                action: "query",
                prop: "",
                titles: title,
                redirects: true,
            },
        });
        const pageInfo = Object.values(pages);
        if (pageInfo[0].pageid) {
            console.log(`获取到萌百页面：${title}→${pageInfo[0].title}`);
            title = `[[${pageInfo[0].title}]]`;
        } else if (!/^[a-zA-Z0-9-:_ ]+$/.test(title)) {
            title = `{{lj|${pageInfo[0].title}}}`;
        }
    } catch (error) {
        console.error(`获取${title}是否存在萌百对应页面失败：${error}`);
    }
    const isMain = chara.slice(0, 3) === "メイン" ? "'''" : "";
    const charas = chara.replace(/(メイン|サブ|その他)( : )?/, "").replaceAll(" ", "");
    const platform = version ? `（${version}）` : "";
    const item = `* ${isMain}${charas}${isMain}————《${title}》${platform}`;
    wikitextBase[date.slice(0, 4)].push(item);
}

// 生成wiki文本
const wikitext = `{{声优信息
|名字={{PAGENAME}}
|image=
|姓名={{日本人名|}}
|其它艺名=
|性别=女性
|配演语言=日语
|出道角色=
|代表角色=
|本体=
}}

'''${name}'''是日本的女性声优，主要从事[[成人游戏]]的配音工作。

== 出演作品 ==
* 主要角色以'''粗体'''显示。
=== 游戏 ===
${Object.entries(wikitextBase).map(([key, value]) => `\n'''${key}年'''\n${value.join("\n")}`).join("\n")}

{{R-18作品声优索引}}

== 外部链接 ==`;

// 保存
try {
    await fs.promises.mkdir("output");
} catch (error) { /* empty */ }

const path = `output/${name}.wikitext`;

await fs.promises.writeFile(path, wikitext);

console.log(`条目源代码已保存到${path}`);