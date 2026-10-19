import io
p='parts/10_data.js'
s=io.open(p,encoding='utf-8').read()
old = """    tags: ['全线隧道', '环线东段', '换乘密集', '杨浦滨江'],
    start: '09:04:00', dwell: 28, highlights: '杨浦滨江 · 同济 · 上海站'
  },"""
new = """    tags: ['全线隧道', '环线东段', '换乘密集', '杨浦滨江'],
    start: '09:04:00', dwell: 28, highlights: '杨浦滨江 · 同济 · 上海站',
    stations: [
      { zh: '世纪大道', en: 'Century Avenue', lat: 31.23429, lon: 121.52308, y: -14, tr: ['2号线', '6号线', '9号线'], near: '世纪大道枢纽' },
      { zh: '浦东大道', en: 'Pudong Avenue', lat: 31.24032, lon: 121.51725, y: -13, tr: [], near: '浦东大道' },
      { zh: '杨树浦路', en: 'Yangshupu Road', lat: 31.24864, lon: 121.51682, y: -13, tr: [], near: '杨浦滨江' },
      { zh: '大连路', en: 'Dalian Road', lat: 31.25349, lon: 121.51734, y: -14, tr: ['12号线'], near: '大连路隧道' },
      { zh: '临平路', en: 'Linping Road', lat: 31.25913, lon: 121.50681, y: -13, tr: [], near: '瑞虹新城' },
      { zh: '海伦路', en: 'Hailun Road', lat: 31.26419, lon: 121.49437, y: -14, tr: ['10号线'], near: '音乐谷' },
      { zh: '邮电新村', en: 'Youdian Xincun', lat: 31.26948, lon: 121.48928, y: -13, tr: [], near: '鲁迅公园' },
      { zh: '四平路', en: 'Siping Road', lat: 31.27601, lon: 121.49186, y: -14, tr: ['8号线', '10号线'], near: '同济大学' },
      { zh: '同济大学', en: 'Tongji University', lat: 31.28298, lon: 121.49806, y: -13, tr: ['10号线'], near: '同济大学' },
      { zh: '上海火车站', en: 'Shanghai Railway Station', lat: 31.24960, lon: 121.45580, y: -12, tr: ['1号线', '3号线'], near: '铁路上海站' }
    ]
  },"""
assert old in s
s=s.replace(old,new,1)
io.open(p,'w',encoding='utf-8').write(s)
print('l4e ok')
