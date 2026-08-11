# CSharp 基础数据结构

这个分类用于复习 C# 常用集合与基础数据结构语法：`List<T>`、数组、`Dictionary<TKey, TValue>`、`HashSet<T>`、`Queue<T>`、`Stack<T>`，以及常见增删查改写法。

## 先建立总模型

选择集合前先回答：是否需要顺序、是否按 key 查找、是否允许重复、下一项按什么顺序取出。API 相似不代表数据结构可以互换。

### 同一组数据放进不同集合

```text
输入：[7, 7, 3, 5]
List：保留 [7, 7, 3, 5]
HashSet：得到 {7, 3, 5}
Dictionary：可保存 {7 -> 出现 2 次, 3 -> 1 次, 5 -> 1 次}
Queue：下一项是最早进入的 7
Stack：下一项是最后进入的 5
```

## 推荐顺序

1. List 与删除规则。
2. Dictionary 和 HashSet。
3. Queue、Stack 与处理顺序。
4. 排序、查找、筛选以及配套语法。

## 已收录

- [List 常用操作与删除规则](./List常用操作与删除规则.md)
- [Dictionary 常用操作与深入用法](./Dictionary常用操作与深入用法.md)
- [HashSet 常用操作与去重检测](./HashSet常用操作与去重检测.md)
- [Queue 与 Stack 常用操作](./Queue与Stack常用操作.md)
- [集合常见配套语法](./集合常见配套语法.md)
- [集合排序查找筛选](./集合排序查找筛选.md)
- [位标记 Flags 与 BitMask](../游戏逻辑常用模式/位标记Flags与BitMask.md)
