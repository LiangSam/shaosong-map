# 绍宋舆图

《绍宋》（榴弹怕水）的读书地图：用时间轴串起建炎元年到建炎十年的战事、人事与疆域变化，并且可以按阅读进度隐藏剧透。

纯静态站点，没有构建步骤，也不依赖外部 CDN（Leaflet、d3-delaunay 已放在 `vendor/`）。地形晕渲图层用的是 Esri 的瓦片，加载失败时地图仍可正常使用。

## 目录

```
index.html          页面骨架
css/style.css       样式（宣纸 / 夜墨两套配色）
js/app.js           地图、时间轴、面板、防剧透逻辑
data/events.js      90 条编年事件（时间、地点、人物、摘要、原著章节、行军路线、行在位置）
data/world.js       势力配色、约 260 个州府控制点、疆域变化（PHASES）
data/people.js      人物档案（按章节解锁的经历）
data/chapters.js    六卷章节标题（阅读进度选择用）
data/battles.js     七场战役的沙盘推演数据（部署、阶段、箭头、镜头）
data/offices.js     人事表：各职位任期（含防剧透的揭晓章节）
data/glossary.js    名词解释（官制、军制、金制、地理）
data/places.js      古今地名对照
js/sandbox.js       沙盘推演引擎
data/geo.js         海岸线、河湖（Natural Earth，已裁剪简化），外加北宋末黄河、汴河、梁山泊
vendor/             Leaflet 1.9.4、d3-delaunay 6.0.4
```

## 疆域是怎么画的

`world.js` 里给每个州府一个坐标和所属区域，按时间依次套用 `PHASES` 里的归属变化，再用 Voronoi 把各州府扩成区域、裁到陆地范围内，同势力合并上色。所以边界只是**示意**，不是精确的史实边界。

要调整某一时刻的归属，在 `PHASES` 里加一条：

```js
{ t: T(5, 7, 10), note: '岳飞破伪齐主力，京东全境收复', set: { 济南: 'song', 京东某区域代码: 'song' } }
```

`set` 的键可以是城名，也可以是区域代码（如 `HBW` 河北西路）。如果这条变化本身会剧透，可以加 `ch: [卷, 章]`，读到之前不生效。

## 添加事件

在 `data/events.js` 里按格式追加即可，数组会自动按时间排序。

- `t: T(年, 月, 日)`：建炎年号与农历月日
- `ch: [卷, 章]`：事件在原著中出现的章节，用于防剧透
- `emp`：当时赵玖所在位置；`true` 表示就在事发地
- `routes`：行军箭头，`f` 为势力

## 本地预览

```bash
python3 -m http.server 8765 --directory ~/Developer/projects/shaosong-map
```

然后打开 http://localhost:8765

## 部署

线上地址：https://shaosong.liangmouyin.com

站点用 Cloudflare Workers 的静态资源托管，配置在 `wrangler.jsonc`，子域名也写在里面，部署时会自动绑定。改完后在项目目录运行：

```bash
npx -y wrangler@4.40.0 deploy
```

`.assetsignore` 列出了不会上传的文件（`.git`、README、配置文件等）。

注意：wrangler 4.156 在绑定自定义域名时会报 “This Worker does not exist”，所以这里固定用 4.40.0。

## 资料说明

事件依据原著正文整理，摘要是转述；个别日期在原著中只写到“上旬”“春”之类，这里取了近似值。
