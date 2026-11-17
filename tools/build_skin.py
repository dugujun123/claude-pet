"""给换肤生成桌面 SVG 帧：只取 build_frames.py 产出的 SVG_BODY，换个名字写成单独的 ts 文件。
终端帧不随皮肤变，所以不导出 TERM_CELLS。
用法：python3 build_skin.py <皮肤图目录，含 idle/working/done.png> <输出 ts> <导出名>
例：python3 tools/build_skin.py <DeepSeek图目录> hooks/frames_deepseek.ts SVG_BODY_DEEPSEEK
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

src, out_ts, name = sys.argv[1], sys.argv[2], sys.argv[3]
with tempfile.TemporaryDirectory() as tmp:
    full = Path(tmp) / "frames.ts"
    subprocess.run([sys.executable, str(Path(__file__).with_name("build_frames.py")), src, str(full)], check=True)
    body = re.search(r"export const SVG_BODY: Record<PetState, string> = (\{.*?\n\})\n", full.read_text(), re.S).group(1)
Path(out_ts).write_text(
    "// 由 tools/build_skin.py 生成，不要手改。\n"
    "import type { PetState } from './frames'\n\n"
    f"export const {name}: Record<PetState, string> = {body}\n"
)
print("写入", out_ts)
