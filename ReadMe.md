Python vgamepad库模拟游戏手柄，终于可以单人成行了。

操作方法：

1. 提前安装 [python](https://www.python.org) 3 和最新版的 [ViGEmBus](https://github.com/nefarius/ViGEmBus/releases) (ViGEmBus已停止维护，但应该还能用)

2. 运行 `pip install vgamepad aiohttp`。注意安装过程中会尝试安装旧版的 ViGEmBus，应该取消安装。多次点击 Cancel 或 Finish 按钮取消。

3. 运行 main.cmd，手机和电脑连接到同一网络(通过wifi或者热点)并打开黑窗口里面显示的网址（如果有多个请逐一尝试）

4. ⭙ 按钮变成绿色就说明连接成功了（连接失败可能是因为开了两个窗口，只能连上一个）

连发键：

[A][B][X][Y] 这种方括号按键是对应 A B X Y 按键的连发键。按下开始连发，再次按下停止。

宏按键:

输入框输入空格分隔的按键名字（方便复制：`↑ ↓ ← → ❐ ☰ ⭙`），`.`代表等待一段时间（减速，点越多越慢）。

其中 ↑ 可以用 `up` 或者 `DU` (dpad up的缩写) 代替，  
↓ 可以用 `down` 或者 `DD` (dpad down的缩写) 代替，  
← 可以用 `left` 或者 `DL` (dpad left的缩写) 代替，  
→ 可以用 `right` 或者 `DR` (dpad right的缩写) 代替，  
❐ 可以用 `BA` (back) 代替，  
☰ 可以用 `ST` (start) 代替，  
⭙ 可以用 `GU` (guide) 代替。  
点 ▶ 开始循环操作。再次点击停止。

修改 script.js 的 buttonmap 变量可以改变按键布局。空格数量需要是偶数。

---

注意：`script.js` 是用 `script.ts` 通过 `typescript` 编译器生成的。

数据没有任何加密和验证，只要知道链接就可以控制虚拟手柄。因此不用时应尽量关闭。

可以通过删除 path_prefix.txt 并重新启动 main.cmd 来重置链接里的随机字符。