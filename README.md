# declare.js
declare.js is a function for helping write object oriented javascript code. It is extracted from DOJO.

declare.js用来方便编写面向对象的js代码，其提供**类的创建**，**继承/多继承**及**父类方法调用**的功能。该方法抽取自[dojo](https://github.com/dojo/dojo)中的[declare](https://github.com/dojo/dojo/blob/master/_base/declare.js)模块，去除了其AOP相关的功能。

# 安装
npm install ft-declare

# 加载
支持AMD与CommonJs的方式加载模块
## AMD
```javascript
define(['declare'], function(declare){
  return declare(null, {
    // 创建类
  });
});
```
## CommonJs
```javascript
var declare = require('declare');
return declare(null, {
  // 创建类
});
```

# 创建类
```javascript
var C1 = declare(null, {
  constructor : function() {
    // 构造函数
    this.name = 'c1';
  },
  sayHi : function() {
    console.log('hi, i am ' + this.name);
  },
  sayHello : function() {
    console.log('hello');
  }
});
var c1 = new C1();
```

# 继承类
```javascript
var C2 = declare([C1], {
  sayHi : function() {
    this.inherited(arguments);
    console.log('hello,bye!');
  }
});
var c2 = new C2();
c2.sayHi();
```
C2继承自父类C1并复写成员函数`sayHi`,通过`inherited`方法可在复写过程中调用父类的同名方法。

# 多继承
```javascript
var C3 = declare([C1, C2], {
});
```
C3有两个父类C1与C2，declare通过实现[C3线性算法](https://en.wikipedia.org/wiki/C3_linearization)来给予js多继承能力。

# mixin
`declare.mixin`提供与`jQuery.extend`相似的功能
