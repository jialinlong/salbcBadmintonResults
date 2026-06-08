// utils/pinyin.js - 拼音转换工具

const pinyinMap = {
  // 百家姓
  '张': 'zhang', '王': 'wang', '李': 'li', '赵': 'zhao', '刘': 'liu',
  '陈': 'chen', '杨': 'yang', '黄': 'huang', '周': 'zhou', '吴': 'wu',
  '徐': 'xu', '孙': 'sun', '马': 'ma', '朱': 'zhu', '胡': 'hu',
  '郭': 'guo', '何': 'he', '高': 'gao', '林': 'lin', '罗': 'luo',
  '郑': 'zheng', '梁': 'liang', '谢': 'xie', '宋': 'song', '唐': 'tang',
  '许': 'xu', '韩': 'han', '冯': 'feng', '邓': 'deng', '曹': 'cao',
  '彭': 'peng', '曾': 'zeng', '肖': 'xiao', '田': 'tian', '董': 'dong',
  '袁': 'yuan', '潘': 'pan', '于': 'yu', '蒋': 'jiang', '蔡': 'cai',
  '余': 'yu', '杜': 'du', '叶': 'ye', '程': 'cheng', '苏': 'su',
  '魏': 'wei', '吕': 'lv', '丁': 'ding', '任': 'ren', '沈': 'shen',
  '姚': 'yao', '卢': 'lu', '姜': 'jiang', '崔': 'cui', '钟': 'zhong',
  '谭': 'tan', '陆': 'lu', '汪': 'wang', '范': 'fan', '金': 'jin',
  '石': 'shi', '廖': 'liao', '贾': 'jia', '夏': 'xia', '韦': 'wei',
  '付': 'fu', '方': 'fang', '白': 'bai', '邹': 'zou', '孟': 'meng',
  '熊': 'xiong', '秦': 'qin', '邱': 'qiu', '江': 'jiang', '尹': 'yin',
  '薛': 'xue', '闫': 'yan', '段': 'duan', '雷': 'lei', '侯': 'hou',
  '龙': 'long', '史': 'shi', '陶': 'tao', '黎': 'li', '贺': 'he',
  '顾': 'gu', '毛': 'mao', '郝': 'hao', '龚': 'gong', '邵': 'shao',
  '万': 'wan', '钱': 'qian', '严': 'yan', '武': 'wu', '戴': 'dai',
  '莫': 'mo', '孔': 'kong', '向': 'xiang', '常': 'chang', '汤': 'tang',
  
  // 🌟 根据你的球员名单新增的字
  '恩': 'en',       // 肖恩
  '蛙': 'wa',       // 青蛙
  '青': 'qing',     // 青蛙
  '浦': 'pu',       // 浦江
  '咕': 'gu',       // 大咕
  '点': 'dian',     // 点点
  '樵': 'qiao',     // 樵夫
  '夫': 'fu',       // 樵夫
  '微': 'wei',      // 微寒
  '寒': 'han',      // 微寒
  '昊': 'hao',      // 天昊
  '劳': 'lao',      // 劳动
  '俊': 'jun',      // 阿俊
  '阿': 'a',        // 阿俊
  '宝': 'bao',      // 宝哥
  '哥': 'ge',       // 宝哥
  '标': 'biao',     // 标
  '辫': 'bian',     // 辫儿
  '儿': 'er',       // 辫儿
  '奇': 'qi',       // 天奇
  
  // 常用名字
  '伟': 'wei', '芳': 'fang', '娜': 'na', '敏': 'min', '静': 'jing',
  '丽': 'li', '强': 'qiang', '磊': 'lei', '军': 'jun', '洋': 'yang',
  '勇': 'yong', '艳': 'yan', '杰': 'jie', '涛': 'tao', '明': 'ming',
  '超': 'chao', '秀': 'xiu', '英': 'ying', '华': 'hua', '文': 'wen',
  '慧': 'hui', '兰': 'lan', '红': 'hong', '霞': 'xia', '鹏': 'peng',
  '飞': 'fei', '燕': 'yan', '平': 'ping', '刚': 'gang', '桂': 'gui',
  '玲': 'ling', '建': 'jian', '国': 'guo', '东': 'dong',
  '波': 'bo', '斌': 'bin', '辉': 'hui', '鑫': 'xin',
  '云': 'yun', '峰': 'feng', '浩': 'hao', '亮': 'liang', '凯': 'kai',
  '松': 'song', '博': 'bo', '威': 'wei',
  '帅': 'shuai', '彬': 'bin', '瑞': 'rui', '锋': 'feng', '达': 'da',
  '安': 'an', '成': 'cheng', '康': 'kang', '星': 'xing', '光': 'guang',
  '天': 'tian', '宇': 'yu', '思': 'si', '海': 'hai', '山': 'shan',
  '仁': 'ren', '宁': 'ning', '福': 'fu', '生': 'sheng',
  '元': 'yuan', '全': 'quan', '胜': 'sheng',
  '学': 'xue', '祥': 'xiang', '才': 'cai', '发': 'fa',
  '新': 'xin', '利': 'li', '清': 'qing', '富': 'fu',
  '顺': 'shun', '信': 'xin', '子': 'zi',
  '昌': 'chang', '翔': 'xiang', '毅': 'yi', '权': 'quan', '友': 'you',
  '良': 'liang', '柏': 'bai', '雪': 'xue',
  '动': 'dong',     // 劳动
  
  // 数字
  '一': 'yi', '二': 'er', '三': 'san', '四': 'si', '五': 'wu',
  '六': 'liu', '七': 'qi', '八': 'ba', '九': 'jiu', '十': 'shi',
  '零': 'ling',
  
  // 其他常用字
  '小': 'xiao', '大': 'da', '老': 'lao', '美': 'mei',
  // 在 pinyinMap 中添加
'芒': 'mang',     // 芒果
'果': 'guo',      // 芒果
'嗨': 'hai',      // 嗨皮
'皮': 'pi',       // 嗨皮
'圣': 'sheng',    // 大圣
'蘑': 'mo',       // 蘑菇
'菇': 'gu',       // 蘑菇
'轼': 'shi',      // 苏轼
'季': 'ji',       // 季伟杰
}

/**
 * 中文转拼音
 * @param {String} chinese - 中文字符串
 * @returns {Object} { fullPinyin: '全拼', firstLetters: '首字母' }
 */
function toPinyin(chinese) {
  if (!chinese) return { fullPinyin: '', firstLetters: '' }
  
  let fullPinyin = ''
  let firstLetters = ''
  
  for (let char of chinese) {
    if (pinyinMap[char]) {
      // 中文字符
      const py = pinyinMap[char]
      fullPinyin += py
      firstLetters += py[0]
    } else {
      // 非中文字符（如英文、数字）保持原样
      const lowerChar = char.toLowerCase()
      fullPinyin += lowerChar
      firstLetters += lowerChar
    }
  }
  
  return {
    fullPinyin,
    firstLetters
  }
}

module.exports = {
  toPinyin
}